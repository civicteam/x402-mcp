import { createHttpPassthroughProxy, createStdioPassthroughProxy } from '@civic/passthrough-mcp-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Wallet } from 'x402/types';
import { makePaymentAwareClientTransport } from '../client.js';
import { createClientProxy } from './client.js';

// Mock dependencies
vi.mock('@civic/passthrough-mcp-server', () => ({
  createHttpPassthroughProxy: vi.fn(),
  createStdioPassthroughProxy: vi.fn(),
}));

vi.mock('../client.js', () => ({
  makePaymentAwareClientTransport: vi.fn(),
}));

describe('createClientProxy', () => {
  let mockWallet: Wallet;
  let mockHttpProxy: any;
  let mockStdioProxy: any;
  let mockTransport: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockWallet = {
      account: { address: '0xabc' },
      chain: { id: 1 },
    } as unknown as Wallet;

    mockHttpProxy = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    mockStdioProxy = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    mockTransport = {
      send: vi.fn(),
      receive: vi.fn(),
    };

    vi.mocked(makePaymentAwareClientTransport).mockReturnValue(mockTransport);
    vi.mocked(createHttpPassthroughProxy).mockResolvedValue(mockHttpProxy);
    vi.mocked(createStdioPassthroughProxy).mockResolvedValue(mockStdioProxy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('HTTP mode', () => {
    it('should create an HTTP proxy with default port', async () => {
      const targetUrl = 'http://example.com/mcp';

      const proxy = await createClientProxy({
        targetUrl,
        wallet: mockWallet,
        mode: 'http',
      });

      expect(makePaymentAwareClientTransport).toHaveBeenCalledWith(targetUrl, mockWallet);

      expect(vi.mocked(createHttpPassthroughProxy)).toHaveBeenCalledWith({
        port: 4000,
        target: {
          transportType: 'custom',
          transportFactory: expect.any(Function),
        },
      });

      expect(proxy).toBe(mockHttpProxy);
    });

    it('should create an HTTP proxy with custom port', async () => {
      const targetUrl = 'http://example.com/mcp';
      const customPort = 5555;

      const proxy = await createClientProxy({
        targetUrl,
        wallet: mockWallet,
        mode: 'http',
        port: customPort,
      });

      expect(vi.mocked(createHttpPassthroughProxy)).toHaveBeenCalledWith({
        port: customPort,
        target: {
          transportType: 'custom',
          transportFactory: expect.any(Function),
        },
      });

      expect(proxy).toBe(mockHttpProxy);
    });

    it('should use the transport factory correctly', async () => {
      const targetUrl = 'http://example.com/mcp';

      await createClientProxy({
        targetUrl,
        wallet: mockWallet,
        mode: 'http',
      });

      const callArgs = vi.mocked(createHttpPassthroughProxy).mock.calls[0][0];

      // Check that target is configured with custom transport
      expect(callArgs.target.transportType).toBe('custom');

      // Test that the factory returns the payment-aware transport
      if (callArgs.target.transportType === 'custom' && 'transportFactory' in callArgs.target) {
        const transport = callArgs.target.transportFactory();
        expect(transport).toBe(mockTransport);
      }
    });
  });

  describe('stdio mode', () => {
    it('should create a stdio proxy', async () => {
      const targetUrl = 'http://example.com/mcp';

      const proxy = await createClientProxy({
        targetUrl,
        wallet: mockWallet,
        mode: 'stdio',
      });

      expect(makePaymentAwareClientTransport).toHaveBeenCalledWith(targetUrl, mockWallet);

      expect(vi.mocked(createStdioPassthroughProxy)).toHaveBeenCalledWith({
        target: {
          transportType: 'custom',
          transportFactory: expect.any(Function),
        },
      });

      expect(proxy).toBe(mockStdioProxy);
    });

    it('should use the transport factory correctly in stdio mode', async () => {
      const targetUrl = 'http://example.com/mcp';

      await createClientProxy({
        targetUrl,
        wallet: mockWallet,
        mode: 'stdio',
      });

      const callArgs = vi.mocked(createStdioPassthroughProxy).mock.calls[0][0];

      // Check that target is configured with custom transport
      expect(callArgs.target.transportType).toBe('custom');

      // Test that the factory returns the payment-aware transport
      if (callArgs.target.transportType === 'custom' && 'transportFactory' in callArgs.target) {
        const transport = callArgs.target.transportFactory();
        expect(transport).toBe(mockTransport);
      }
    });
  });

  describe('transport integration', () => {
    it('should pass wallet to payment-aware transport', async () => {
      const targetUrl = 'https://secure.example.com/mcp';
      const wallet = {
        account: { address: '0x123456' },
        chain: { id: 8453 },
      } as unknown as Wallet;

      await createClientProxy({
        targetUrl,
        wallet,
        mode: 'http',
      });

      expect(makePaymentAwareClientTransport).toHaveBeenCalledWith(targetUrl, wallet);
    });

    it('should handle different URL formats', async () => {
      const urls = ['http://localhost:3000/mcp', 'https://api.example.com/v1/mcp', 'http://192.168.1.1:8080'];

      for (const url of urls) {
        vi.clearAllMocks();

        await createClientProxy({
          targetUrl: url,
          wallet: mockWallet,
          mode: 'stdio',
        });

        expect(makePaymentAwareClientTransport).toHaveBeenCalledWith(url, mockWallet);
      }
    });
  });
});
