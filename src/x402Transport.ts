import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { IncomingMessage, ServerResponse } from "http";
import { exact } from "x402/schemes";
import { useFacilitator } from "x402/verify";
import { 
  computeRoutePatterns, 
  findMatchingPaymentRequirements, 
  findMatchingRoute,
  processPriceToAtomicAmount,
  toJsonSafe
} from "x402/shared";
import { 
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  isJSONRPCRequest,
  isJSONRPCResponse,
  isJSONRPCError
} from "@modelcontextprotocol/sdk/types.js";
import { getAddress } from "viem";
import { Address } from "viem";
import { settleResponseHeader } from "x402/types";

interface X402TransportOptions {
  payTo: Address;
  routes: any;
  facilitator?: any;
  sessionIdGenerator?: () => string;
  enableJsonResponse?: boolean;
  toolPricing?: Record<string, string>;
}

interface SettlementInfo {
  transactionHash?: string;
  error?: string;
}

export class X402StreamableHTTPServerTransport {
  private transport: StreamableHTTPServerTransport;
  private payTo: Address;
  private routes: any;
  private facilitator?: any;
  private routePatterns: any;
  private settlementMap: Map<string | number, SettlementInfo> = new Map();
  private requestPaymentMap: Map<string | number, any> = new Map();
  private pendingPayment: any = null;
  private toolPricing: Record<string, string>;

  constructor(options: X402TransportOptions) {
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: options.sessionIdGenerator,
      enableJsonResponse: options.enableJsonResponse ?? true // Default to JSON responses
    });
    
    this.payTo = options.payTo;
    this.routes = options.routes;
    this.facilitator = options.facilitator;
    this.routePatterns = computeRoutePatterns(this.routes);
    this.toolPricing = options.toolPricing || {};
    
    console.log('🔧 [X402Transport] Created with payTo:', this.payTo);
    console.log('   Tool pricing:', this.toolPricing);

    // Intercept messages to handle payment verification and settlement
    this.setupMessageInterception();
  }

  // Delegate transport methods
  get sessionId() { return this.transport.sessionId; }
  get onclose() { return this.transport.onclose; }
  set onclose(handler) { this.transport.onclose = handler; }
  get onerror() { return this.transport.onerror; }
  set onerror(handler) { this.transport.onerror = handler; }
  get onmessage() { return this.transport.onmessage; }
  set onmessage(handler) { this.transport.onmessage = handler; }

  async start() {
    return this.transport.start();
  }

  async close() {
    return this.transport.close();
  }

  async send(message: JSONRPCMessage, options?: any) {
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
                settled: true
              }
            }
          };
        }
      }
    }

    return this.transport.send(message, options);
  }

  async handleRequest(req: IncomingMessage & { auth?: any }, res: ServerResponse, parsedBody?: any): Promise<void> {
    console.log('\n📥 [X402Transport] Handling request');
    console.log('   Method:', req.method);
    console.log('   URL:', req.url);
    
    // Only intercept POST requests to the MCP endpoint
    if (req.method !== 'POST' || !parsedBody) {
      return this.transport.handleRequest(req, res, parsedBody);
    }

    // Check if this is a tool call that requires payment
    const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
    const toolCall = messages.find((msg: any) => 
      msg.method === 'tools/call' && 
      msg.params?.name && 
      this.toolPricing[msg.params.name]
    );

    if (!toolCall) {
      console.log('   ✅ No paid tool calls, delegating to transport');
      return this.transport.handleRequest(req, res, parsedBody);
    }

    const toolName = toolCall.params.name;
    const toolPrice = this.toolPricing[toolName];
    console.log(`   💰 Found paid tool call: ${toolName} (${toolPrice})`);

    // Check for X-PAYMENT header
    const paymentHeader = req.headers['x-payment'];
    if (!paymentHeader || Array.isArray(paymentHeader)) {
      console.log('   ❌ No X-PAYMENT header found, returning 402');
      res.writeHead(402).end(JSON.stringify({
        x402Version: 1,
        error: "X-PAYMENT header is required",
        accepts: this.getPaymentRequirementsForTool(toolName, toolPrice)
      }));
      return;
    }

    // Decode and verify payment
    let decodedPayment: any;
    try {
      decodedPayment = exact.evm.decodePayment(paymentHeader);
      decodedPayment.x402Version = 1;
      console.log('   🔐 Decoded payment:', {
        scheme: decodedPayment.scheme,
        network: decodedPayment.network,
        from: decodedPayment.payload?.authorization?.from,
        to: decodedPayment.payload?.authorization?.to,
        value: decodedPayment.payload?.authorization?.value
      });
    } catch (error) {
      console.log('   ❌ Failed to decode payment:', error);
      res.writeHead(402).end(JSON.stringify({
        x402Version: 1,
        error: "Invalid payment header",
        accepts: this.getPaymentRequirementsForTool(toolName, toolPrice)
      }));
      return;
    }

    // Verify payment at HTTP level
    console.log('   🔐 Verifying payment at HTTP level...');
    try {
      const { verify } = useFacilitator(this.facilitator);
      const paymentRequirements = this.getPaymentRequirementsForTool(toolName, toolPrice);
      
      const selectedPaymentRequirements = findMatchingPaymentRequirements(
        paymentRequirements,
        decodedPayment
      );

      if (!selectedPaymentRequirements) {
        console.log('   ❌ No matching payment requirements');
        res.writeHead(402).end(JSON.stringify({
          x402Version: 1,
          error: "Unable to find matching payment requirements",
          accepts: paymentRequirements
        }));
        return;
      }

      const verifyResponse = await verify(decodedPayment, selectedPaymentRequirements);
      console.log('   📡 Verify response:', verifyResponse);
      
      if (!verifyResponse.isValid) {
        console.log('   ❌ Payment verification failed');
        res.writeHead(402).end(JSON.stringify({
          x402Version: 1,
          error: verifyResponse.invalidReason || "Payment verification failed",
          accepts: paymentRequirements
        }));
        return;
      }

      console.log('   ✅ Payment verified successfully');
    } catch (error: any) {
      console.log('   ❌ Verification error:', error.message);
      res.writeHead(402).end(JSON.stringify({
        x402Version: 1,
        error: error.message,
        accepts: this.getPaymentRequirementsForTool(toolName, toolPrice)
      }));
      return;
    }

    // Store payment for later use
    this.pendingPayment = {
      payment: decodedPayment,
      toolName,
      toolPrice,
      req
    };

    // Delegate to transport
    return this.transport.handleRequest(req, res, parsedBody);
  }

  private setupMessageInterception() {
    const originalOnMessage = this.transport.onmessage;
    
    // Intercept incoming messages
    this.transport.onmessage = async (message: JSONRPCMessage, extra?: any) => {
      console.log('   🔍 [X402Transport] Intercepting message:', message);

      // Check if this is a tool call that requires payment
      if (isJSONRPCRequest(message) && message.method === 'tools/call' && message.params) {
        const toolName = (message.params as any).name;
        const toolPrice = this.toolPricing[toolName];
        
        if (toolPrice && this.pendingPayment) {
          console.log(`   💰 Tool '${toolName}' has verified payment`);
          
          // Track which request this payment is for
          if (message.id !== undefined) {
            this.requestPaymentMap.set(message.id, {
              ...this.pendingPayment,
              request: message // Store the original request for settlement
            });
          }
        }
      }

      // Call original handler
      if (originalOnMessage) {
        await originalOnMessage.call(this.transport, message, extra);
      }
    };
  }

  private getPaymentRequirementsForTool(toolName: string, price: string): any[] {
    const network = 'base-sepolia'; // TODO: make configurable
    
    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ("error" in atomicAmountForAsset) {
      throw new Error(atomicAmountForAsset.error);
    }

    const { maxAmountRequired, asset } = atomicAmountForAsset;

    return [{
      scheme: "exact",
      network,
      maxAmountRequired,
      resource: `mcp://tool/${toolName}`,
      description: `Payment for MCP tool: ${toolName}`,
      mimeType: "application/json",
      payTo: getAddress(this.payTo),
      maxTimeoutSeconds: 60,
      asset: getAddress(asset.address),
      outputSchema: undefined,
      extra: asset.eip712
    }];
  }


  private async settlePayment(paymentInfo: any, response: JSONRPCResponse | JSONRPCError): Promise<SettlementInfo> {
    console.log('   💰 [X402Transport] Settling payment for response:', response.id);
    
    // Only settle successful responses
    if (isJSONRPCError(response)) {
      console.log('   ❌ Skipping settlement for error response');
      return { error: "Response is an error" };
    }

    try {
      const { settle } = useFacilitator(this.facilitator);
      
      // Get the original request to determine tool and pricing
      const originalRequest = paymentInfo.request;
      const toolName = originalRequest?.params?.name;
      const toolPrice = this.toolPricing[toolName];
      
      if (!toolPrice) {
        throw new Error(`No pricing found for tool: ${toolName}`);
      }
      
      const paymentRequirements = this.getPaymentRequirementsForTool(toolName, toolPrice);
      
      const selectedPaymentRequirements = findMatchingPaymentRequirements(
        paymentRequirements,
        paymentInfo.payment
      );

      if (!selectedPaymentRequirements) {
        throw new Error("Unable to find matching payment requirements");
      }

      const settleResponse = await settle(paymentInfo.payment, selectedPaymentRequirements);
      console.log('   💳 Settle response:', settleResponse);
      
      return {
        transactionHash: settleResponse.transaction
      };
    } catch (error: any) {
      console.log('   ❌ Settlement error:', error.message);
      return {
        error: error.message
      };
    }
  }
}