import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makePaymentAwareClientTransport } from './client.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { wrapFetchWithPayment } from 'x402-fetch';
import { convertHeaders } from './util.js';
import { WalletClient } from 'viem';

// Mock dependencies
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn()
}));

vi.mock('x402-fetch', () => ({
  wrapFetchWithPayment: vi.fn()
}));

vi.mock('./util.js', () => ({
  convertHeaders: vi.fn()
}));

// Mock global fetch using vi.stubGlobal
vi.stubGlobal('fetch', vi.fn());

describe('makePaymentAwareClientTransport', () => {
  let mockWalletClient: WalletClient;
  let mockX402Fetch: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockWalletClient = {
      account: { address: '0xabc' },
      chain: { id: 1 }
    } as unknown as WalletClient;
    
    mockX402Fetch = vi.fn();
    vi.mocked(wrapFetchWithPayment).mockReturnValue(mockX402Fetch);
    
    vi.mocked(convertHeaders).mockImplementation((headers) => {
      if (!headers) return {};
      if (headers instanceof Headers) {
        const obj: Record<string, string> = {};
        headers.forEach((value, key) => obj[key] = value);
        return obj;
      }
      return headers as Record<string, string>;
    });
    
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should create StreamableHTTPClientTransport with wrapped fetch', () => {
    const serverUrl = 'http://localhost:3000/mcp';
    
    makePaymentAwareClientTransport(serverUrl, mockWalletClient);
    
    expect(wrapFetchWithPayment).toHaveBeenCalledWith(fetch, mockWalletClient);
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        fetch: expect.any(Function)
      })
    );
  });

  it('should accept URL object as serverUrl', () => {
    const serverUrl = new URL('http://localhost:3000/mcp');
    
    makePaymentAwareClientTransport(serverUrl, mockWalletClient);
    
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      serverUrl,
      expect.objectContaining({
        fetch: expect.any(Function)
      })
    );
  });

  describe('fetchWithPayment wrapper', () => {
    let fetchWithPayment: any;

    beforeEach(() => {
      makePaymentAwareClientTransport('http://localhost:3000/mcp', mockWalletClient);
      
      // Extract the fetch function passed to StreamableHTTPClientTransport
      const transportCall = vi.mocked(StreamableHTTPClientTransport).mock.calls[0];
      fetchWithPayment = transportCall[1]?.fetch;
    });

    it('should preserve headers and add Accept header', async () => {
      const mockResponse = new Response('test', { status: 200 });
      mockX402Fetch.mockResolvedValue(mockResponse);
      
      const headers = new Headers({
        'Content-Type': 'application/json',
        'X-Custom': 'value'
      });
      
      vi.mocked(convertHeaders).mockReturnValue({
        'Content-Type': 'application/json',
        'X-Custom': 'value'
      });
      
      await fetchWithPayment('http://localhost:3000', {
        method: 'POST',
        headers,
        body: 'test'
      });
      
      expect(convertHeaders).toHaveBeenCalledWith(headers);
      expect(mockX402Fetch).toHaveBeenCalledWith(
        'http://localhost:3000',
        expect.objectContaining({
          method: 'POST',
          body: 'test',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom': 'value',
            'Accept': 'application/json, text/event-stream'
          })
        })
      );
    });

    it('should handle requests without headers', async () => {
      const mockResponse = new Response('test', { status: 200 });
      mockX402Fetch.mockResolvedValue(mockResponse);
      
      vi.mocked(convertHeaders).mockReturnValue({});
      
      await fetchWithPayment('http://localhost:3000', {
        method: 'GET'
      });
      
      expect(mockX402Fetch).toHaveBeenCalledWith(
        'http://localhost:3000',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/json, text/event-stream'
          })
        })
      );
    });

    it('should log payment response when present', async () => {
      const mockHeaders = new Headers({
        'X-PAYMENT-RESPONSE': 'eyJ0eEhhc2giOiAiMHgxMjMifQ=='
      });
      const mockResponse = new Response('test', { 
        status: 200,
        headers: mockHeaders
      });
      mockX402Fetch.mockResolvedValue(mockResponse);
      
      await fetchWithPayment('http://localhost:3000', {});
      
      expect(consoleLogSpy).toHaveBeenCalledWith('\n💰 Payment made:');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Response:', 'eyJ0eEhhc2giOiAiMHgxMjMifQ==');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Decoded:', { txHash: '0x123' });
      expect(consoleLogSpy).toHaveBeenCalledWith('   Transaction Hash:', '0x123');
    });

    it('should handle invalid payment response gracefully', async () => {
      const mockHeaders = new Headers({
        'X-PAYMENT-RESPONSE': 'not-valid-base64!!!'
      });
      const mockResponse = new Response('test', { 
        status: 200,
        headers: mockHeaders
      });
      mockX402Fetch.mockResolvedValue(mockResponse);
      
      await fetchWithPayment('http://localhost:3000', {});
      
      expect(consoleLogSpy).toHaveBeenCalledWith('\n💰 Payment made:');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Response:', 'not-valid-base64!!!');
      // Should not throw, just skip decoding
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Decoded:'));
    });

    it('should handle response without payment header', async () => {
      const mockResponse = new Response('test', { status: 200 });
      mockX402Fetch.mockResolvedValue(mockResponse);
      
      await fetchWithPayment('http://localhost:3000', {});
      
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Payment made'));
    });

    it('should preserve existing Accept header if more specific', async () => {
      const mockResponse = new Response('test', { status: 200 });
      mockX402Fetch.mockResolvedValue(mockResponse);
      
      vi.mocked(convertHeaders).mockReturnValue({
        'Accept': 'application/xml'
      });
      
      await fetchWithPayment('http://localhost:3000', {
        headers: { 'Accept': 'application/xml' }
      });
      
      expect(mockX402Fetch).toHaveBeenCalledWith(
        'http://localhost:3000',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json, text/event-stream'
          })
        })
      );
    });
  });
});