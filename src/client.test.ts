import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Wallet } from 'x402/types';
import { wrapFetchWithPayment } from 'x402-fetch';
import { makePaymentAwareClientTransport } from './client.js';
import { convertHeaders } from './util.js';

// Mock dependencies
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

vi.mock('x402-fetch', () => ({
  wrapFetchWithPayment: vi.fn(),
}));

vi.mock('./util.js', () => ({
  convertHeaders: vi.fn(),
}));

// Mock global fetch using vi.stubGlobal
vi.stubGlobal('fetch', vi.fn());

describe('makePaymentAwareClientTransport', () => {
  let mockWallet: Wallet;
  let mockX402Fetch: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWallet = {
      account: { address: '0xabc' },
      chain: { id: 1 },
    } as unknown as Wallet;

    mockX402Fetch = vi.fn();
    vi.mocked(wrapFetchWithPayment).mockReturnValue(mockX402Fetch);

    vi.mocked(convertHeaders).mockImplementation((headers: HeadersInit | undefined): Record<string, string> => {
      if (!headers) return {};
      if (headers instanceof Headers) {
        const obj: Record<string, string> = {};
        headers.forEach((value: string, key: string) => {
          obj[key] = value;
        });
        return obj;
      }
      return headers as Record<string, string>;
    });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should create StreamableHTTPClientTransport with wrapped fetch', () => {
    const serverUrl = 'http://localhost:3000/mcp';

    makePaymentAwareClientTransport(serverUrl, mockWallet);

    expect(wrapFetchWithPayment).toHaveBeenCalledWith(fetch, mockWallet);
    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        fetch: expect.any(Function),
      })
    );
  });

  it('should accept URL object as serverUrl', () => {
    const serverUrl = new URL('http://localhost:3000/mcp');

    makePaymentAwareClientTransport(serverUrl, mockWallet);

    expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
      serverUrl,
      expect.objectContaining({
        fetch: expect.any(Function),
      })
    );
  });

  describe('fetchWithPayment wrapper', () => {
    let fetchWithPayment: any;
    let paymentCallback: any;

    beforeEach(() => {
      paymentCallback = vi.fn();
      makePaymentAwareClientTransport('http://localhost:3000/mcp', mockWallet, paymentCallback);

      // Extract the fetch function passed to StreamableHTTPClientTransport
      const transportCall = vi.mocked(StreamableHTTPClientTransport).mock.calls[0];
      fetchWithPayment = transportCall[1]?.fetch;
    });

    it('should preserve headers and add Accept header', async () => {
      const mockResponse = new Response('test', { status: 200 });
      mockX402Fetch.mockResolvedValue(mockResponse);

      const headers = new Headers({
        'Content-Type': 'application/json',
        'X-Custom': 'value',
      });

      vi.mocked(convertHeaders).mockReturnValue({
        'Content-Type': 'application/json',
        'X-Custom': 'value',
      });

      await fetchWithPayment('http://localhost:3000', {
        method: 'POST',
        headers,
        body: 'test',
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
            Accept: 'application/json, text/event-stream',
          }),
        })
      );
    });

    it('should handle requests without headers', async () => {
      const mockResponse = new Response('test', { status: 200 });
      mockX402Fetch.mockResolvedValue(mockResponse);

      vi.mocked(convertHeaders).mockReturnValue({});

      await fetchWithPayment('http://localhost:3000', {
        method: 'GET',
      });

      expect(mockX402Fetch).toHaveBeenCalledWith(
        'http://localhost:3000',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json, text/event-stream',
          }),
        })
      );
    });

    it('should call payment callback when payment response is present', async () => {
      const mockHeaders = new Headers({
        'X-PAYMENT-RESPONSE': 'eyJ0eEhhc2giOiAiMHgxMjMifQ==',
      });
      const mockResponse = new Response('test', {
        status: 200,
        headers: mockHeaders,
      });
      mockX402Fetch.mockResolvedValue(mockResponse);

      await fetchWithPayment('http://localhost:3000', {});

      expect(paymentCallback).toHaveBeenCalledWith('0x123');
    });

    it('should handle invalid payment response gracefully', async () => {
      const mockHeaders = new Headers({
        'X-PAYMENT-RESPONSE': 'not-valid-base64!!!',
      });
      const mockResponse = new Response('test', {
        status: 200,
        headers: mockHeaders,
      });
      mockX402Fetch.mockResolvedValue(mockResponse);

      await fetchWithPayment('http://localhost:3000', {});

      // Should log error but not call callback
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Failed to decode payment response:', expect.any(Error));
      expect(paymentCallback).not.toHaveBeenCalled();
    });

    it('should handle response without payment header', async () => {
      const mockResponse = new Response('test', { status: 200 });
      mockX402Fetch.mockResolvedValue(mockResponse);

      await fetchWithPayment('http://localhost:3000', {});

      expect(paymentCallback).not.toHaveBeenCalled();
    });

    it('should handle payment response without callback provided', async () => {
      // Re-create transport without callback
      makePaymentAwareClientTransport('http://localhost:3000/mcp', mockWallet);
      const transportCall = vi.mocked(StreamableHTTPClientTransport).mock.calls[1];
      const fetchWithoutCallback = transportCall[1]?.fetch;

      const mockHeaders = new Headers({
        'X-PAYMENT-RESPONSE': 'eyJ0eEhhc2giOiAiMHgxMjMifQ==',
      });
      const mockResponse = new Response('test', {
        status: 200,
        headers: mockHeaders,
      });
      mockX402Fetch.mockResolvedValue(mockResponse);

      // Should not throw even without callback
      await expect(fetchWithoutCallback?.('http://localhost:3000', {})).resolves.toBe(mockResponse);
    });

    it('should preserve existing Accept header if more specific', async () => {
      const mockResponse = new Response('test', { status: 200 });
      mockX402Fetch.mockResolvedValue(mockResponse);

      vi.mocked(convertHeaders).mockReturnValue({
        Accept: 'application/xml',
      });

      await fetchWithPayment('http://localhost:3000', {
        headers: { Accept: 'application/xml' },
      });

      expect(mockX402Fetch).toHaveBeenCalledWith(
        'http://localhost:3000',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/json, text/event-stream',
          }),
        })
      );
    });
  });
});
