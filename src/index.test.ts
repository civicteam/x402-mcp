import { describe, expect, it, vi } from 'vitest';
import { makePaymentAwareClientTransport, makePaymentAwareServerTransport } from './index.js';

// Mock the actual implementations
vi.mock('./server.js', () => ({
  makePaymentAwareServerTransport: vi.fn().mockReturnValue('mocked-server-transport'),
}));

vi.mock('./client.js', () => ({
  makePaymentAwareClientTransport: vi.fn().mockReturnValue('mocked-client-transport'),
}));

describe('index exports', () => {
  it('should export makePaymentAwareServerTransport from server.js', () => {
    const mockPayTo = '0x123';
    const mockToolPricing = { tool1: '$0.01' };
    const mockOptions = { enableJsonResponse: true };

    const result = makePaymentAwareServerTransport(mockPayTo, mockToolPricing, mockOptions);

    expect(result).toBe('mocked-server-transport');
    expect(vi.mocked(makePaymentAwareServerTransport)).toHaveBeenCalledWith(mockPayTo, mockToolPricing, mockOptions);
  });

  it('should export makePaymentAwareClientTransport from client.js', () => {
    const mockServerUrl = 'http://localhost:3000';
    const mockWalletClient = { account: { address: '0xabc' } };

    const result = makePaymentAwareClientTransport(mockServerUrl, mockWalletClient as any);

    expect(result).toBe('mocked-client-transport');
    expect(vi.mocked(makePaymentAwareClientTransport)).toHaveBeenCalledWith(mockServerUrl, mockWalletClient);
  });
});
