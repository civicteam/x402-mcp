import { describe, it, expect, vi, beforeEach } from 'vitest';
import { X402StreamableHTTPServerTransport, makePaymentAwareServerTransport } from './server.js';
import { IncomingMessage, ServerResponse } from 'http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { exact } from 'x402/schemes';
import { useFacilitator } from 'x402/verify';
import { findMatchingPaymentRequirements, processPriceToAtomicAmount } from 'x402/shared';
import { getAddress } from 'viem';

// Mock dependencies
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    sessionId: 'test-session',
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    handleRequest: vi.fn().mockResolvedValue(undefined),
    onmessage: null,
    onclose: null,
    onerror: null
  }))
}));

vi.mock('x402/schemes', () => ({
  exact: {
    evm: {
      decodePayment: vi.fn()
    }
  }
}));

vi.mock('x402/verify', () => ({
  useFacilitator: vi.fn()
}));

vi.mock('x402/shared', () => ({
  findMatchingPaymentRequirements: vi.fn(),
  processPriceToAtomicAmount: vi.fn()
}));

vi.mock('viem', () => ({
  getAddress: vi.fn((addr) => addr)
}));

// Helper functions for test setup
function createMockStreamableTransport() {
  return {
    sessionId: 'test-session',
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    handleRequest: vi.fn().mockResolvedValue(undefined),
    onmessage: null,
    onclose: null,
    onerror: null
  };
}

function createMockFacilitator() {
  const mockVerify = vi.fn().mockResolvedValue({ isValid: true });
  const mockSettle = vi.fn().mockResolvedValue({ transaction: '0x123' });
  
  return {
    verify: mockVerify,
    settle: mockSettle,
    list: vi.fn(),
    mockVerify,
    mockSettle
  };
}

function createMockPaymentRequirements() {
  return {
    scheme: 'exact' as const,
    network: 'base-sepolia' as const,
    maxAmountRequired: '10000',
    resource: 'mcp://tool/test-tool',
    description: 'Payment for MCP tool: test-tool',
    mimeType: 'application/json',
    payTo: '0x123',
    maxTimeoutSeconds: 60,
    asset: '0xUSDC',
    outputSchema: undefined,
    extra: {}
  };
}

function createMockRequest() {
  return {
    method: 'POST',
    url: '/mcp',
    headers: {}
  };
}

function createMockResponse() {
  const writeHeadSpy = vi.fn();
  const endSpy = vi.fn().mockReturnThis();
  
  // Setup chained method calls
  writeHeadSpy.mockReturnValue({ end: endSpy });
  
  return {
    mockRes: {
      writeHead: writeHeadSpy,
      end: endSpy
    },
    writeHeadSpy,
    endSpy
  };
}

// Test the isToolCallParams type guard
describe('isToolCallParams', () => {
  const isToolCallParams = (params: unknown): params is { name: string; arguments?: any } => {
    return (
      params !== null &&
      typeof params === 'object' &&
      'name' in params &&
      typeof (params as { name: unknown }).name === 'string'
    );
  };

  it('should return true for valid tool call params', () => {
    expect(isToolCallParams({ name: 'test-tool' })).toBe(true);
    expect(isToolCallParams({ name: 'test-tool', arguments: {} })).toBe(true);
    expect(isToolCallParams({ name: 'test-tool', arguments: { foo: 'bar' } })).toBe(true);
  });

  it('should return false for invalid params', () => {
    expect(isToolCallParams(null)).toBe(false);
    expect(isToolCallParams(undefined)).toBe(false);
    expect(isToolCallParams({})).toBe(false);
    expect(isToolCallParams({ name: 123 })).toBe(false);
    expect(isToolCallParams({ notName: 'test' })).toBe(false);
    expect(isToolCallParams('string')).toBe(false);
    expect(isToolCallParams(123)).toBe(false);
  });
});

describe('X402StreamableHTTPServerTransport', () => {
  let transport: X402StreamableHTTPServerTransport;
  let mockStreamableTransport: any;
  let mockReq: Partial<IncomingMessage>;
  let mockRes: Partial<ServerResponse>;
  let mockVerify: any;
  let mockSettle: any;
  let writeHeadSpy: any;
  let endSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks using helper functions
    mockStreamableTransport = createMockStreamableTransport();
    vi.mocked(StreamableHTTPServerTransport).mockImplementation(() => mockStreamableTransport);
    
    const facilitator = createMockFacilitator();
    mockVerify = facilitator.mockVerify;
    mockSettle = facilitator.mockSettle;
    vi.mocked(useFacilitator).mockReturnValue(facilitator as any);
    
    vi.mocked(processPriceToAtomicAmount).mockReturnValue({
      maxAmountRequired: '10000',
      asset: {
        address: '0xUSDC',
        eip712: {
          name: 'USDC',
          version: '1.0'
        }
      }
    } as any);
    
    vi.mocked(findMatchingPaymentRequirements).mockReturnValue(createMockPaymentRequirements());
    
    mockReq = createMockRequest();
    
    const response = createMockResponse();
    mockRes = response.mockRes as any;
    writeHeadSpy = response.writeHeadSpy;
    endSpy = response.endSpy;
    
    transport = new X402StreamableHTTPServerTransport({
      payTo: '0x123',
      toolPricing: {
        'test-tool': '$0.01'
      }
    });
  });

  describe('constructor', () => {
    it('should create transport with default options', () => {
      const transport = new X402StreamableHTTPServerTransport({
        payTo: '0x123',
        toolPricing: { 'tool1': '$0.01' }
      });
      
      expect(StreamableHTTPServerTransport).toHaveBeenCalledWith({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });
    });

    it('should pass through custom options', () => {
      const sessionIdGen = () => 'custom-id';
      const transport = new X402StreamableHTTPServerTransport({
        payTo: '0x123',
        toolPricing: { 'tool1': '$0.01' },
        sessionIdGenerator: sessionIdGen,
        enableJsonResponse: false
      });
      
      expect(StreamableHTTPServerTransport).toHaveBeenCalledWith({
        sessionIdGenerator: sessionIdGen,
        enableJsonResponse: false
      });
    });
  });

  describe('delegate methods', () => {
    it('should delegate start() to underlying transport', async () => {
      await transport.start();
      expect(mockStreamableTransport.start).toHaveBeenCalled();
    });

    it('should delegate close() to underlying transport', async () => {
      await transport.close();
      expect(mockStreamableTransport.close).toHaveBeenCalled();
    });

    it('should delegate sessionId getter', () => {
      expect(transport.sessionId).toBe('test-session');
    });

    it('should delegate onclose handler', () => {
      const handler = vi.fn();
      transport.onclose = handler;
      expect(mockStreamableTransport.onclose).toBe(handler);
    });

    it('should delegate onerror handler', () => {
      const handler = vi.fn();
      transport.onerror = handler;
      expect(mockStreamableTransport.onerror).toBe(handler);
    });

    it('should delegate onmessage handler', () => {
      const handler = vi.fn();
      transport.onmessage = handler;
      expect(mockStreamableTransport.onmessage).toBe(handler);
    });
  });

  describe('handleRequest', () => {
    it('should delegate non-POST requests', async () => {
      mockReq.method = 'GET';
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse);
      
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes, undefined);
    });

    it('should delegate requests without body', async () => {
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse);
      
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes, undefined);
    });

    it('should delegate non-tool-call requests', async () => {
      const body = { method: 'initialize', params: {} };
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes, body);
    });

    it('should delegate unpaid tool calls', async () => {
      const body = {
        method: 'tools/call',
        params: { name: 'unpaid-tool' }
      };
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes, body);
    });

    it('should return 402 for paid tool without payment header', async () => {
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' }
      };
      
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      // Check the chained writeHead(402).end() call
      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });

    it('should return 402 for invalid payment header', async () => {
      vi.mocked(exact.evm.decodePayment).mockImplementationOnce(() => {
        throw new Error('Invalid payment format');
      });
      
      mockReq.headers = { 'x-payment': 'invalid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' }
      };
      
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });

    it('should return 402 when payment verification fails', async () => {
      mockVerify.mockResolvedValueOnce({ isValid: false, invalidReason: 'Insufficient funds' });
      
      vi.mocked(exact.evm.decodePayment).mockReturnValue({
        scheme: 'exact',
        network: 'base-sepolia',
        x402Version: 1,
        payload: {
          signature: '0xmocksignature',
          authorization: {
            from: '0xabc',
            to: '0x123',
            value: '10000',
            validAfter: '0',
            validBefore: '999999999999',
            nonce: '1'
          }
        }
      });
      
      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' }
      };
      
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });

    it('should process valid payment and delegate request', async () => {
      vi.mocked(exact.evm.decodePayment).mockReturnValue({
        scheme: 'exact',
        network: 'base-sepolia',
        x402Version: 1,
        payload: {
          signature: '0xmocksignature',
          authorization: {
            from: '0xabc',
            to: '0x123',
            value: '10000',
            validAfter: '0',
            validBefore: '999999999999',
            nonce: '1'
          }
        }
      });
      
      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' }
      };
      
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      expect(mockVerify).toHaveBeenCalled();
      expect(mockStreamableTransport.handleRequest).toHaveBeenCalledWith(mockReq, mockRes, body);
    });

    it('should handle array of messages', async () => {
      const body = [
        { method: 'initialize', params: {} },
        { method: 'tools/call', params: { name: 'test-tool' } }
      ];
      
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('should pass through requests without modification', async () => {
      const message = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: 1
      };
      
      await transport.send(message);
      
      expect(mockStreamableTransport.send).toHaveBeenCalledWith(message, undefined);
    });

    it('should include settlement info in successful responses', async () => {
      // Setup payment info
      const requestId = 1;
      const paymentInfo = {
        payment: {
          scheme: 'exact' as const,
          network: 'base-sepolia',
          x402Version: 1,
          payload: {}
        },
        toolName: 'test-tool',
        toolPrice: '$0.01',
        request: {
          jsonrpc: '2.0' as const,
          method: 'tools/call',
          params: { name: 'test-tool' },
          id: requestId
        }
      };
      
      // Simulate storing payment info
      (transport as any).requestPaymentMap.set(requestId, paymentInfo);
      
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId
      };
      
      await transport.send(response);
      
      expect(mockSettle).toHaveBeenCalled();
      expect(mockStreamableTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({
            x402Settlement: {
              transactionHash: '0x123',
              settled: true
            }
          })
        }),
        undefined
      );
    });

    it('should not settle error responses', async () => {
      const requestId = 1;
      const paymentInfo = {
        payment: {},
        toolName: 'test-tool',
        request: { id: requestId }
      };
      
      (transport as any).requestPaymentMap.set(requestId, paymentInfo);
      
      const errorResponse = {
        jsonrpc: '2.0' as const,
        error: { code: -32603, message: 'Internal error' },
        id: requestId
      };
      
      await transport.send(errorResponse);
      
      expect(mockSettle).not.toHaveBeenCalled();
    });
  });

  describe('message interception', () => {
    it('should setup message interception on construction', async () => {
      // Verify that the transport's onmessage handler is wrapped
      expect(mockStreamableTransport.onmessage).toBeDefined();
      expect(mockStreamableTransport.onmessage).toBeInstanceOf(Function);
    });

    it('should handle tool call messages with payment info', async () => {
      // Get the wrapped onmessage handler
      const wrappedHandler = mockStreamableTransport.onmessage;
      
      // Setup payment info
      (transport as any).pendingPayment = {
        payment: { scheme: 'exact' },
        toolName: 'test-tool',
        toolPrice: '$0.01'
      };
      
      // Create a tool call message
      const toolCallMessage = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: 123
      };
      
      // Call the wrapped handler
      await wrappedHandler.call(mockStreamableTransport, toolCallMessage);
      
      // Verify payment info was tracked
      expect((transport as any).requestPaymentMap.has(123)).toBe(true);
    });

    it('should pass through non-tool-call messages', async () => {
      const wrappedHandler = mockStreamableTransport.onmessage;
      
      const message = {
        jsonrpc: '2.0' as const,
        method: 'initialize',
        params: {}
      };
      
      // Should not throw and not track payment
      await wrappedHandler.call(mockStreamableTransport, message);
      
      expect((transport as any).requestPaymentMap.size).toBe(0);
    });

    it('should handle tool calls without payment requirement', async () => {
      const wrappedHandler = mockStreamableTransport.onmessage;
      
      const message = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'free-tool' },
        id: 456
      };
      
      await wrappedHandler.call(mockStreamableTransport, message);
      
      // Should not track payment for free tools
      expect((transport as any).requestPaymentMap.has(456)).toBe(false);
    });

    it('should call original handler when set', async () => {
      const originalHandler = vi.fn();
      transport.onmessage = originalHandler;
      
      const wrappedHandler = mockStreamableTransport.onmessage;
      const message = { jsonrpc: '2.0' as const, method: 'test' };
      
      await wrappedHandler.call(mockStreamableTransport, message, { some: 'extra' });
      
      expect(originalHandler).toHaveBeenCalledWith(message, { some: 'extra' });
    });
  });

  describe('settlement errors', () => {
    it('should handle settlement errors gracefully', async () => {
      mockSettle.mockRejectedValueOnce(new Error('Settlement failed'));
      
      const requestId = 1;
      const paymentInfo = {
        payment: {
          scheme: 'exact' as const,
          network: 'base-sepolia',
          x402Version: 1,
          payload: {}
        },
        request: {
          jsonrpc: '2.0' as const,
          method: 'tools/call',
          params: { name: 'test-tool' },
          id: requestId
        }
      };
      
      (transport as any).requestPaymentMap.set(requestId, paymentInfo);
      
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId
      };
      
      await transport.send(response);
      
      const settlementInfo = (transport as any).settlementMap.get(requestId);
      expect(settlementInfo).toEqual({ error: 'Settlement failed' });
    });

    it('should handle missing tool pricing during settlement', async () => {
      const requestId = 1;
      const paymentInfo = {
        payment: {},
        request: {
          jsonrpc: '2.0' as const,
          method: 'tools/call',
          params: { name: 'unknown-tool' },
          id: requestId
        }
      };
      
      (transport as any).requestPaymentMap.set(requestId, paymentInfo);
      
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId
      };
      
      await transport.send(response);
      
      const settlementInfo = (transport as any).settlementMap.get(requestId);
      expect(settlementInfo.error).toBeDefined();
    });

    it('should handle invalid request params during settlement', async () => {
      const requestId = 1;
      const paymentInfo = {
        payment: {},
        request: {
          jsonrpc: '2.0' as const,
          method: 'tools/call',
          params: { notName: 'test' }, // Invalid params
          id: requestId
        }
      };
      
      (transport as any).requestPaymentMap.set(requestId, paymentInfo);
      
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId
      };
      
      await transport.send(response);
      
      const settlementInfo = (transport as any).settlementMap.get(requestId);
      expect(settlementInfo.error).toBeDefined();
    });
  });

  describe('payment requirements edge cases', () => {
    it('should return 402 when no matching payment requirements found', async () => {
      vi.mocked(findMatchingPaymentRequirements).mockReturnValueOnce(undefined);
      vi.mocked(exact.evm.decodePayment).mockReturnValue({
        scheme: 'exact',
        network: 'base-sepolia',
        x402Version: 1,
        payload: {
          signature: '0xmocksignature',
          authorization: {
            from: '0xabc',
            to: '0x123',
            value: '10000',
            validAfter: '0',
            validBefore: '999999999999',
            nonce: '1'
          }
        }
      });
      
      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' }
      };
      
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });

    it('should handle payment requirements processing error', async () => {
      // Create a new transport with a different tool pricing that will cause an error
      const errorTransport = new X402StreamableHTTPServerTransport({
        payTo: '0x123',
        toolPricing: {
          'error-tool': '$0.01'
        }
      });
      
      // Mock to return an error for this specific call
      vi.mocked(processPriceToAtomicAmount).mockReturnValueOnce({
        error: 'Invalid price format'
      } as any);
      
      const body = {
        method: 'tools/call',
        params: { name: 'error-tool' }
      };
      
      await expect(errorTransport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body))
        .rejects.toThrow('Invalid price format');
    });

    it('should handle verification exceptions', async () => {
      vi.mocked(exact.evm.decodePayment).mockReturnValue({
        scheme: 'exact',
        network: 'base-sepolia',
        x402Version: 1,
        payload: {
          signature: '0xmocksignature',
          authorization: {
            from: '0xabc',
            to: '0x123',
            value: '10000',
            validAfter: '0',
            validBefore: '999999999999',
            nonce: '1'
          }
        }
      });
      
      mockVerify.mockRejectedValueOnce(new Error('Network error'));
      
      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' }
      };
      
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);
      
      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('payment response header', () => {
    it('should add payment response header when available', async () => {
      const mockHeaders = { 'content-type': 'application/json' };
      const mockStatusCode = 200;
      
      // Setup a response with payment header
      (transport as any).currentResponse = mockRes;
      (transport as any).responsePaymentHeaders.set(mockRes, 'payment-response-data');
      
      // Call handleRequest to setup writeHead override
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, {});
      
      // Simulate writeHead being called
      writeHeadSpy.mockClear();
      writeHeadSpy.mockReturnValue(mockRes);
      
      // Call the overridden writeHead
      (mockRes as any).writeHead(mockStatusCode, mockHeaders);
      
      expect(writeHeadSpy).toHaveBeenCalledWith(mockStatusCode, {
        ...mockHeaders,
        'X-PAYMENT-RESPONSE': 'payment-response-data'
      });
    });

    it('should not add payment header for array headers', async () => {
      const mockHeaders = [['content-type', 'application/json']];
      
      (transport as any).currentResponse = mockRes;
      (transport as any).responsePaymentHeaders.set(mockRes, 'payment-response-data');
      
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, {});
      
      writeHeadSpy.mockClear();
      writeHeadSpy.mockReturnValue(mockRes);
      
      (mockRes as any).writeHead(200, mockHeaders);
      
      expect(writeHeadSpy).toHaveBeenCalledWith(200, mockHeaders);
    });

    it('should handle settlement with no matching payment requirements', async () => {
      vi.mocked(findMatchingPaymentRequirements).mockReturnValueOnce(undefined);
      
      const requestId = 1;
      const paymentInfo = {
        payment: { scheme: 'exact' },
        request: {
          jsonrpc: '2.0' as const,
          method: 'tools/call',
          params: { name: 'test-tool' },
          id: requestId
        }
      };
      
      (transport as any).requestPaymentMap.set(requestId, paymentInfo);
      
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId
      };
      
      await transport.send(response);
      
      const settlementInfo = (transport as any).settlementMap.get(requestId);
      expect(settlementInfo.error).toBeDefined();
    });
  });

  describe('makePaymentAwareServerTransport', () => {
    it('should create transport with string address', () => {
      const transport = makePaymentAwareServerTransport(
        '0xabc',
        { 'tool1': '$0.01' }
      );
      
      expect(transport).toBeInstanceOf(X402StreamableHTTPServerTransport);
      expect(getAddress).toHaveBeenCalledWith('0xabc');
    });

    it('should pass through all options', () => {
      const facilitator = { url: 'https://facilitator.example.com' as const };
      const sessionIdGen = () => 'custom-id';
      
      makePaymentAwareServerTransport(
        '0xabc',
        { 'tool1': '$0.01' },
        {
          facilitator,
          sessionIdGenerator: sessionIdGen,
          enableJsonResponse: false
        }
      );
      
      expect(StreamableHTTPServerTransport).toHaveBeenCalledWith({
        sessionIdGenerator: sessionIdGen,
        enableJsonResponse: false
      });
    });
  });
});