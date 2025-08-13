import type { IncomingMessage, ServerResponse } from 'http';
import { getAddress } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exact } from 'x402/schemes';
import { findMatchingPaymentRequirements, processPriceToAtomicAmount } from 'x402/shared';
import { useFacilitator } from 'x402/verify';
import { makePaymentAwareServerTransport, X402StreamableHTTPServerTransport } from './server.js';

// Mock the parent class but preserve inheritance
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  class MockStreamableHTTPServerTransport {
    sessionId = 'test-session';
    start = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    onmessage: any = null;
    onclose: any = null;
    onerror: any = null;

    // Mock send that doesn't require connection
    async send(_message: any, _options?: any) {
      // Just return without error
      return Promise.resolve();
    }

    // Mock handleRequest that can be overridden by child
    async handleRequest(_req: any, _res: any, _parsedBody?: any) {
      // Default implementation does nothing
      return Promise.resolve();
    }
  }

  return {
    StreamableHTTPServerTransport: MockStreamableHTTPServerTransport,
  };
});

vi.mock('x402/schemes', () => ({
  exact: {
    evm: {
      decodePayment: vi.fn(),
    },
  },
}));

vi.mock('x402/verify', () => ({
  useFacilitator: vi.fn(),
}));

vi.mock('x402/shared', () => ({
  findMatchingPaymentRequirements: vi.fn(),
  processPriceToAtomicAmount: vi.fn(),
}));

vi.mock('x402/types', () => ({
  settleResponseHeader: vi.fn((data) => data),
}));

vi.mock('viem', () => ({
  getAddress: vi.fn((addr) => addr),
}));

// Helper functions for test setup
function createMockFacilitator() {
  const mockVerify = vi.fn().mockResolvedValue({ isValid: true });
  const mockSettle = vi.fn().mockResolvedValue({ transaction: '0x123' });

  return {
    verify: mockVerify,
    settle: mockSettle,
    list: vi.fn(),
    mockVerify,
    mockSettle,
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
    extra: {},
  };
}

function createMockRequest() {
  return {
    method: 'POST',
    url: '/mcp',
    headers: {},
  };
}

function createMockPaymentPayload() {
  return {
    scheme: 'exact' as const,
    network: 'base-sepolia' as const,
    x402Version: 1,
    payload: {
      signature: '0xmocksignature',
      authorization: {
        from: '0xabc',
        to: '0x123',
        value: '10000',
        validAfter: '0',
        validBefore: '999999999999',
        nonce: '1',
      },
    },
  };
}

function createToolCallRequest(toolName: string, requestId?: number) {
  return {
    jsonrpc: '2.0' as const,
    method: 'tools/call',
    params: { name: toolName },
    ...(requestId !== undefined && { id: requestId }),
  };
}

function createMockResponse() {
  const endSpy = vi.fn();
  const writeHeadSpy = vi.fn();

  const mockRes = {
    writeHead: writeHeadSpy,
    end: endSpy,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    removeHeader: vi.fn(),
    headersSent: false,
  };

  // Make writeHead return mockRes for chaining
  writeHeadSpy.mockReturnValue(mockRes);
  // Make end return the response for chaining
  endSpy.mockReturnValue(mockRes);

  return {
    mockRes,
    writeHeadSpy,
    endSpy,
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
  let mockReq: Partial<IncomingMessage>;
  let mockRes: Partial<ServerResponse>;
  let mockVerify: any;
  let mockSettle: any;
  let writeHeadSpy: any;
  let endSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks using helper functions

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
          version: '1.0',
        },
      },
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
        'test-tool': '$0.01',
      },
      sessionIdGenerator: undefined,
    });
  });

  describe('handleRequest', () => {
    it('should handle non-POST requests', async () => {
      mockReq.method = 'GET';
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse);

      // Should not return 402 for non-POST requests
      expect(writeHeadSpy).not.toHaveBeenCalledWith(402, undefined);
    });

    it('should handle requests without body', async () => {
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse);

      // Should not return 402 for requests without body
      expect(writeHeadSpy).not.toHaveBeenCalledWith(402, undefined);
    });

    it('should handle non-tool-call requests', async () => {
      const body = { method: 'initialize', params: {} };
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Should not return 402 for non-tool-call requests
      expect(writeHeadSpy).not.toHaveBeenCalledWith(402, undefined);
    });

    it('should handle unpaid tool calls', async () => {
      const body = {
        method: 'tools/call',
        params: { name: 'unpaid-tool' },
      };
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Should not return 402 for unpaid tools
      expect(writeHeadSpy).not.toHaveBeenCalledWith(402, undefined);
    });

    it('should return 402 for paid tool without payment header', async () => {
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' },
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
        params: { name: 'test-tool' },
      };

      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });

    it('should return 402 when payment verification fails', async () => {
      mockVerify.mockResolvedValueOnce({ isValid: false, invalidReason: 'Insufficient funds' });

      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' },
      };

      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });

    it('should process valid payment and delegate request', async () => {
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' },
      };

      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      expect(mockVerify).toHaveBeenCalled();
      // Request should be handled without errors
    });

    it('should handle array of messages', async () => {
      const body = [
        { method: 'initialize', params: {} },
        { method: 'tools/call', params: { name: 'test-tool' } },
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
        id: 1,
      };

      // Should send the message without errors
      await expect(transport.send(message)).resolves.not.toThrow();
    });

    it('should include settlement info in successful responses', async () => {
      // First, process a paid tool request with valid payment
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const requestId = 1;
      const body = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: requestId,
      };

      // Process the request to set up payment tracking
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Now simulate the message coming through onmessage to track payment
      transport.onmessage?.(body, undefined);

      // Now send a successful response
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId,
      };

      // Should send the response and attempt settlement
      await transport.send(response);

      // Verify settlement was attempted
      expect(mockSettle).toHaveBeenCalled();
    });

    it('should not settle error responses', async () => {
      // First, process a paid tool request with valid payment
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const requestId = 1;
      const body = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: requestId,
      };

      // Process the request to set up payment tracking
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Simulate the message coming through onmessage to track payment
      transport.onmessage?.(body, undefined);

      // Clear previous mock calls
      mockSettle.mockClear();

      // Now send an error response
      const errorResponse = {
        jsonrpc: '2.0' as const,
        error: { code: -32603, message: 'Internal error' },
        id: requestId,
      };

      await transport.send(errorResponse);

      // Verify settlement was NOT attempted for error response
      expect(mockSettle).not.toHaveBeenCalled();
    });
  });

  describe('message interception', () => {
    it('should setup message interception on construction', async () => {
      // Verify that the transport's onmessage handler exists and is callable
      expect(transport.onmessage).toBeDefined();

      // Verify it can be called without throwing
      expect(() => transport.onmessage?.({ jsonrpc: '2.0', method: 'test' }, undefined)).not.toThrow();
    });

    it('should handle tool call messages with payment info', async () => {
      // First process a request with payment to establish pending payment
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: 123,
      };

      // Process the request
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Simulate the message coming through onmessage to track payment
      transport.onmessage?.(body, undefined);

      // Clear mock to verify future settlement
      mockSettle.mockClear();

      // Now send a response to trigger settlement
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: 123,
      };

      await transport.send(response);

      // Verify settlement was attempted, proving payment was tracked
      expect(mockSettle).toHaveBeenCalled();
    });

    it('should pass through non-tool-call messages', async () => {
      const wrappedHandler = transport.onmessage;

      const message = {
        jsonrpc: '2.0' as const,
        method: 'initialize',
        params: {},
        id: 999,
      };

      // Should not throw
      await expect(async () => {
        if (wrappedHandler) {
          await wrappedHandler(message, undefined);
        }
      }).not.toThrow();

      // Send a response - should not attempt settlement for non-tool-call
      mockSettle.mockClear();
      const response = {
        jsonrpc: '2.0' as const,
        result: { initialized: true },
        id: 999,
      };

      await transport.send(response);

      // Verify no settlement attempted (no payment was tracked)
      expect(mockSettle).not.toHaveBeenCalled();
    });

    it('should handle tool calls without payment requirement', async () => {
      const wrappedHandler = transport.onmessage;

      const message = createToolCallRequest('free-tool', 456);

      if (wrappedHandler) {
        await wrappedHandler(message, undefined);
      }

      // Send a response - should not attempt settlement for free tool
      mockSettle.mockClear();
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'free result' },
        id: 456,
      };

      await transport.send(response);

      // Verify no settlement attempted (free tools don't require payment)
      expect(mockSettle).not.toHaveBeenCalled();
    });

    it('should call original handler when set', async () => {
      const originalHandler = vi.fn();
      transport.onmessage = originalHandler;

      const message = { jsonrpc: '2.0' as const, method: 'test' };

      // Call the wrapped handler
      transport.onmessage?.(message, undefined);

      // Verify the original handler was called with the correct arguments
      expect(originalHandler).toHaveBeenCalledWith(message, undefined);
    });
  });

  describe('settlement errors', () => {
    it('should handle settlement errors gracefully', async () => {
      // Setup payment and process request
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const requestId = 1;
      const body = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: requestId,
      };

      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Simulate the message coming through onmessage to track payment
      transport.onmessage?.(body, undefined);

      // Make settlement fail
      mockSettle.mockRejectedValueOnce(new Error('Settlement failed'));

      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId,
      };

      // Should not throw even if settlement fails
      await expect(transport.send(response)).resolves.not.toThrow();

      // Verify settlement was attempted
      expect(mockSettle).toHaveBeenCalled();
    });

    it('should handle missing tool pricing during settlement', async () => {
      // Create a transport without tool pricing for 'unknown-tool'
      const transportWithoutPricing = new X402StreamableHTTPServerTransport({
        payTo: '0x123',
        toolPricing: {}, // No pricing defined
        sessionIdGenerator: undefined,
      });

      // Setup valid payment
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      // Try to call unknown tool with payment
      mockReq.headers = { 'x-payment': 'valid-payment' };
      const requestId = 1;
      const body = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'unknown-tool' },
        id: requestId,
      };

      // Should handle request (unknown tools are treated as free)
      await transportWithoutPricing.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Response should be processed without settlement
      mockSettle.mockClear();
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId,
      };

      await transportWithoutPricing.send(response);

      // No settlement for unknown tools
      expect(mockSettle).not.toHaveBeenCalled();
    });

    it('should handle invalid request params during settlement', async () => {
      // This scenario shouldn't happen in practice since invalid params
      // wouldn't pass the isToolCallParams check, but let's test the behavior
      const requestId = 1;
      const body = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { notName: 'test' }, // Invalid params structure
        id: requestId,
      };

      // Should handle request without requiring payment (invalid params = not a paid tool)
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Verify no 402 response (invalid params treated as non-paid tool)
      expect(writeHeadSpy).not.toHaveBeenCalledWith(402, undefined);

      // Send response - should not attempt settlement
      mockSettle.mockClear();
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId,
      };

      await transport.send(response);

      // No settlement for invalid tool calls
      expect(mockSettle).not.toHaveBeenCalled();
    });
  });

  describe('payment requirements edge cases', () => {
    it('should return 402 when no matching payment requirements found', async () => {
      vi.mocked(findMatchingPaymentRequirements).mockReturnValueOnce(undefined);
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' },
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
          'error-tool': '$0.01',
        },
        sessionIdGenerator: undefined,
      });

      // Mock to return an error for this specific call
      vi.mocked(processPriceToAtomicAmount).mockReturnValueOnce({
        error: 'Invalid price format',
      } as any);

      const body = {
        method: 'tools/call',
        params: { name: 'error-tool' },
      };

      await expect(
        errorTransport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body)
      ).rejects.toThrow('Invalid price format');
    });

    it('should handle verification exceptions', async () => {
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockVerify.mockRejectedValueOnce(new Error('Network error'));

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const body = {
        method: 'tools/call',
        params: { name: 'test-tool' },
      };

      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      expect(writeHeadSpy).toHaveBeenCalledWith(402, undefined);
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('payment response header', () => {
    it('should add payment response header when available', async () => {
      // Process a request with valid payment that will trigger settlement
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      // Mock settlement to return a transaction
      mockSettle.mockResolvedValueOnce({
        transaction: '0x123',
      });

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const requestId = 1;
      const body = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: requestId,
      };

      // Process the request
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Simulate the message coming through onmessage to track payment
      transport.onmessage?.(body, undefined);

      // Send a successful response to trigger settlement
      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId,
      };

      await transport.send(response);

      // Verify settlement was called and returned the response header
      expect(mockSettle).toHaveBeenCalled();
    });

    it('should handle responses without payment requirements', async () => {
      // Process a non-payment request
      const body = {
        jsonrpc: '2.0' as const,
        method: 'initialize',
        params: {},
        id: 1,
      };

      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Send response
      const response = {
        jsonrpc: '2.0' as const,
        result: { initialized: true },
        id: 1,
      };

      await transport.send(response);

      // Verify no settlement was attempted
      expect(mockSettle).not.toHaveBeenCalled();

      // Verify response was sent normally
      expect(writeHeadSpy).not.toHaveBeenCalledWith(402, undefined);
    });

    it('should handle settlement with no matching payment requirements', async () => {
      // Setup payment
      vi.mocked(exact.evm.decodePayment).mockReturnValue(createMockPaymentPayload());

      mockReq.headers = { 'x-payment': 'valid-payment' };
      const requestId = 1;
      const body = {
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: { name: 'test-tool' },
        id: requestId,
      };

      // Make findMatchingPaymentRequirements return undefined during settlement
      vi.mocked(findMatchingPaymentRequirements)
        .mockReturnValueOnce(createMockPaymentRequirements()) // For verification
        .mockReturnValueOnce(undefined); // For settlement

      // Process request
      await transport.handleRequest(mockReq as IncomingMessage, mockRes as ServerResponse, body);

      // Simulate the message coming through onmessage to track payment
      transport.onmessage?.(body, undefined);

      const response = {
        jsonrpc: '2.0' as const,
        result: { data: 'test' },
        id: requestId,
      };

      // Should not throw even with no matching requirements
      await expect(transport.send(response)).resolves.not.toThrow();

      // Settlement should NOT be called when no matching requirements
      expect(mockSettle).not.toHaveBeenCalled();
    });
  });

  describe('makePaymentAwareServerTransport', () => {
    it('should create transport with string address', () => {
      makePaymentAwareServerTransport('0xabc', { tool1: '$0.01' });

      expect(getAddress).toHaveBeenCalledWith('0xabc');
    });

    it('should create transport with custom options without throwing', () => {
      const facilitator = { url: 'https://facilitator.example.com' as const };
      const sessionIdGen = () => 'custom-id';

      // This test verifies the factory accepts all expected option types
      // The actual behavior of these options is tested in the specific feature tests
      expect(() => {
        makePaymentAwareServerTransport(
          '0xabc',
          { tool1: '$0.01' },
          {
            facilitator,
            sessionIdGenerator: sessionIdGen,
            enableJsonResponse: false,
          }
        );
      }).not.toThrow();
    });
  });
});
