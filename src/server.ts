import type { OutgoingHttpHeader, OutgoingHttpHeaders } from 'node:http';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  StreamableHTTPServerTransport,
  type StreamableHTTPServerTransportOptions,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  type CallToolRequest,
  isJSONRPCError,
  isJSONRPCRequest,
  isJSONRPCResponse,
  type JSONRPCError,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type MessageExtraInfo,
  type RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { type Address, getAddress } from 'viem';
import { exact } from 'x402/schemes';
import { findMatchingPaymentRequirements, processPriceToAtomicAmount } from 'x402/shared';
import {
  type FacilitatorConfig,
  type PaymentPayload,
  type PaymentRequirements,
  type Price,
  settleResponseHeader,
} from 'x402/types';
import { useFacilitator } from 'x402/verify';

interface X402TransportOptions {
  payTo: Address;
  facilitator?: FacilitatorConfig;
  toolPricing?: Record<string, string>;
}

interface SettlementInfo {
  transactionHash?: string;
  error?: string;
}

interface ToolCallParams {
  name: string;
  arguments?: CallToolRequest['params']['arguments'];
}

function isToolCallParams(params: unknown): params is ToolCallParams {
  return (
    params !== null &&
    typeof params === 'object' &&
    'name' in params &&
    typeof (params as { name: unknown }).name === 'string'
  );
}

interface PaymentInfo {
  payment: PaymentPayload; // TODO: Type this based on x402 payment structure
  toolName?: string;
  toolPrice?: Price;
  request?: JSONRPCRequest;
  req?: IncomingMessage;
}

export class X402StreamableHTTPServerTransport extends StreamableHTTPServerTransport {
  private payTo: Address;
  private facilitator?: FacilitatorConfig;
  private settlementMap: Map<string | number, SettlementInfo> = new Map();
  private requestPaymentMap: Map<string | number, PaymentInfo> = new Map();
  private pendingPayment: PaymentInfo | null = null;
  private toolPricing: Record<string, Price>;
  private currentResponse: ServerResponse | null = null;
  private responsePaymentHeaders: Map<ServerResponse, string> = new Map();

  constructor(options: X402TransportOptions & StreamableHTTPServerTransportOptions) {
    // Pass through the base transport options, defaulting enableJsonResponse to true
    super({
      ...options,
      enableJsonResponse: options.enableJsonResponse ?? true, // Default to JSON responses
    });

    this.payTo = options.payTo;
    this.facilitator = options.facilitator;
    this.toolPricing = options.toolPricing || {};

    console.log('🔧 [X402Transport] Created with payTo:', this.payTo);
    console.log('   Tool pricing:', this.toolPricing);

    // Intercept messages to handle payment verification and settlement
    this.setupMessageInterception();
  }

  // No need to delegate - we inherit these from the parent class

  async send(
    message: JSONRPCMessage,
    options?: {
      relatedRequestId?: RequestId;
    }
  ) {
    // Intercept responses to include settlement info
    if ((isJSONRPCResponse(message) || isJSONRPCError(message)) && message.id !== undefined) {
      const paymentInfo = this.requestPaymentMap.get(message.id);
      if (paymentInfo && !this.settlementMap.has(message.id)) {
        const settlementInfo = await this.settlePayment(paymentInfo, message);
        this.settlementMap.set(message.id, settlementInfo);

        // Include settlement info in response
        if (isJSONRPCResponse(message) && settlementInfo.transactionHash) {
          message = {
            ...message,
            result: {
              ...message.result,
              x402Settlement: {
                transactionHash: settlementInfo.transactionHash,
                settled: true,
              },
            },
          };
        }
      }
    }

    return super.send(message, options);
  }

  async handleRequest(
    req: IncomingMessage & { auth?: AuthInfo },
    res: ServerResponse,
    parsedBody?: unknown
  ): Promise<void> {
    console.log('\n📥 [X402Transport] Handling request');
    console.log('   Method:', req.method);
    console.log('   URL:', req.url);

    // Store the response object for later use
    this.currentResponse = res;

    // Intercept writeHead to inject payment header
    const originalWriteHead = res.writeHead.bind(res);

    res.writeHead = ((statusCode: number, headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined) => {
      // Check if we have a payment response header for this response
      const paymentHeader = this.responsePaymentHeaders.get(res);
      if (paymentHeader && headers && !Array.isArray(headers)) {
        headers['X-PAYMENT-RESPONSE'] = paymentHeader;
        console.log('   💳 Added X-PAYMENT-RESPONSE header to response');
        // Clean up after use
        this.responsePaymentHeaders.delete(res);
      }
      return originalWriteHead.call(res, statusCode, headers);
    }) as typeof res.writeHead;

    // Only intercept POST requests to the MCP endpoint
    if (req.method !== 'POST' || !parsedBody) {
      return super.handleRequest(req, res, parsedBody);
    }

    // Check if this is a tool call that requires payment
    const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
    const toolCall = messages.find(
      (msg): msg is JSONRPCRequest & { params: ToolCallParams } =>
        msg.method === 'tools/call' &&
        msg.params &&
        typeof msg.params === 'object' &&
        'name' in msg.params &&
        typeof msg.params.name === 'string' &&
        this.toolPricing[msg.params.name] !== undefined
    );

    if (!toolCall) {
      console.log('   ✅ No paid tool calls, delegating to transport');
      return super.handleRequest(req, res, parsedBody);
    }

    const toolName = toolCall.params.name;
    const toolPrice = this.toolPricing[toolName];
    console.log(`   💰 Found paid tool call: ${toolName} (${toolPrice})`);

    // Check for X-PAYMENT header
    const paymentHeader = req.headers['x-payment'];
    if (!paymentHeader || Array.isArray(paymentHeader)) {
      console.log('   ❌ No X-PAYMENT header found, returning 402');
      res.writeHead(402).end(
        JSON.stringify({
          x402Version: 1,
          error: 'X-PAYMENT header is required',
          accepts: this.getPaymentRequirementsForTool(toolName, toolPrice),
        })
      );
      return;
    }

    // Decode and verify payment
    let decodedPayment: PaymentPayload;
    try {
      decodedPayment = exact.evm.decodePayment(paymentHeader);
      decodedPayment.x402Version = 1;
      console.log('   🔐 Decoded payment:', {
        scheme: decodedPayment.scheme,
        network: decodedPayment.network,
        from: decodedPayment.payload?.authorization?.from,
        to: decodedPayment.payload?.authorization?.to,
        value: decodedPayment.payload?.authorization?.value,
      });
    } catch (error) {
      console.log('   ❌ Failed to decode payment:', error);
      res.writeHead(402).end(
        JSON.stringify({
          x402Version: 1,
          error: 'Invalid payment header',
          accepts: this.getPaymentRequirementsForTool(toolName, toolPrice),
        })
      );
      return;
    }

    // Verify payment at HTTP level
    console.log('   🔐 Verifying payment at HTTP level...');
    try {
      const { verify } = useFacilitator(this.facilitator);
      const paymentRequirements = this.getPaymentRequirementsForTool(toolName, toolPrice);

      const selectedPaymentRequirements = findMatchingPaymentRequirements(paymentRequirements, decodedPayment);

      if (!selectedPaymentRequirements) {
        console.log('   ❌ No matching payment requirements');
        res.writeHead(402).end(
          JSON.stringify({
            x402Version: 1,
            error: 'Unable to find matching payment requirements',
            accepts: paymentRequirements,
          })
        );
        return;
      }

      const verifyResponse = await verify(decodedPayment, selectedPaymentRequirements);
      console.log('   📡 Verify response:', verifyResponse);

      if (!verifyResponse.isValid) {
        console.log('   ❌ Payment verification failed');
        res.writeHead(402).end(
          JSON.stringify({
            x402Version: 1,
            error: verifyResponse.invalidReason || 'Payment verification failed',
            accepts: paymentRequirements,
          })
        );
        return;
      }

      console.log('   ✅ Payment verified successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(error);
      console.log('   ❌ Verification error:', errorMessage);
      res.writeHead(402).end(
        JSON.stringify({
          x402Version: 1,
          error: errorMessage,
          accepts: this.getPaymentRequirementsForTool(toolName, toolPrice),
        })
      );
      return;
    }

    // Store payment for later use
    this.pendingPayment = {
      payment: decodedPayment,
      toolName,
      toolPrice,
      req,
    };

    // Delegate to parent class
    return super.handleRequest(req, res, parsedBody);
  }

  private setupMessageInterception() {
    const originalOnMessage = this.onmessage;

    // Intercept incoming messages
    this.onmessage = async (message: JSONRPCMessage, extra?: MessageExtraInfo) => {
      console.log('   🔍 [X402Transport] Intercepting message:', message);

      // Check if this is a tool call that requires payment
      if (isJSONRPCRequest(message) && message.method === 'tools/call' && isToolCallParams(message.params)) {
        const toolName = message.params.name;
        const toolPrice = this.toolPricing[toolName];

        if (toolPrice && this.pendingPayment) {
          console.log(`   💰 Tool '${toolName}' has verified payment`);

          // Track which request this payment is for
          if (message.id !== undefined) {
            this.requestPaymentMap.set(message.id, {
              ...this.pendingPayment,
              request: message, // Store the original request for settlement
            });
          }
        }
      }

      // Call original handler
      if (originalOnMessage) {
        await originalOnMessage.call(this, message, extra);
      }
    };
  }

  private getPaymentRequirementsForTool(toolName: string, price: Price): PaymentRequirements[] {
    const network = 'base-sepolia'; // TODO: make configurable

    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ('error' in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }

    const { maxAmountRequired, asset } = atomicAmountForAsset;

    return [
      {
        scheme: 'exact',
        network,
        maxAmountRequired,
        resource: `mcp://tool/${toolName}`,
        description: `Payment for MCP tool: ${toolName}`,
        mimeType: 'application/json',
        payTo: getAddress(this.payTo),
        maxTimeoutSeconds: 60,
        asset: getAddress(asset.address),
        outputSchema: undefined,
        extra: asset.eip712,
      },
    ];
  }

  private async settlePayment(
    paymentInfo: PaymentInfo,
    response: JSONRPCResponse | JSONRPCError
  ): Promise<SettlementInfo> {
    console.log('   💰 [X402Transport] Settling payment for response:', response.id);

    // Only settle successful responses
    if (isJSONRPCError(response)) {
      console.log('   ❌ Skipping settlement for error response');
      return { error: 'Response is an error' };
    }

    try {
      const { settle } = useFacilitator(this.facilitator);

      // Get the original request to determine tool and pricing
      const originalRequest = paymentInfo.request;

      // Type guard to check if this is a tool call with proper params
      if (!isToolCallParams(originalRequest?.params)) {
        throw new Error('Invalid request: missing tool name');
      }

      const toolName = originalRequest.params.name;

      if (!this.toolPricing[toolName]) {
        throw new Error(`No pricing found for tool: ${toolName}`);
      }

      const toolPrice = this.toolPricing[toolName];
      const paymentRequirements = this.getPaymentRequirementsForTool(toolName, toolPrice);

      const selectedPaymentRequirements = findMatchingPaymentRequirements(paymentRequirements, paymentInfo.payment);

      if (!selectedPaymentRequirements) {
        throw new Error('Unable to find matching payment requirements');
      }

      const settleResponse = await settle(paymentInfo.payment, selectedPaymentRequirements);
      console.log('   💳 Settle response:', settleResponse);

      // Store the payment response header for this response
      if (this.currentResponse) {
        const responseHeader = settleResponseHeader(settleResponse);
        this.responsePaymentHeaders.set(this.currentResponse, responseHeader);
        console.log('   📨 Payment response header prepared:', responseHeader);
      }

      return {
        transactionHash: settleResponse.transaction,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('   ❌ Settlement error:', errorMessage);
      return {
        error: errorMessage,
      };
    }
  }
}

/**
 * Creates a payment-aware MCP server transport that requires X402 payments for specified tools
 * @param payTo - The wallet address to receive payments
 * @param toolPricing - Mapping of tool names to prices (e.g., { "my-tool": "$0.01" })
 * @param options - Optional configuration
 * @returns X402StreamableHTTPServerTransport configured with payment requirements
 */
export function makePaymentAwareServerTransport(
  payTo: Address | string,
  toolPricing: Record<string, string>,
  options?: Partial<StreamableHTTPServerTransportOptions> & {
    facilitator?: FacilitatorConfig;
  }
): X402StreamableHTTPServerTransport {
  return new X402StreamableHTTPServerTransport({
    payTo: getAddress(payTo),
    toolPricing,
    facilitator: options?.facilitator,
    sessionIdGenerator: options?.sessionIdGenerator,
    enableJsonResponse: options?.enableJsonResponse,
  });
}
