import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Wallet } from 'x402/types';
import { wrapFetchWithPayment } from 'x402-fetch';
import { convertHeaders } from './util.js';

/**
 * Creates a payment-aware MCP client transport that automatically handles X402 payments
 * @param serverUrl - The MCP server URL
 * @param wallet - A viem WalletClient configured with account and chain
 * @param paymentCallback
 * @returns StreamableHTTPClientTransport configured with X402 payment capabilities
 */
export function makePaymentAwareClientTransport(
  serverUrl: string | URL,
  wallet: Wallet,
  paymentCallback: (txHash: string) => void = () => {}
): StreamableHTTPClientTransport {
  // Create x402-enabled fetch
  const x402Fetch = wrapFetchWithPayment(fetch, wallet);

  // Create a wrapper that ensures proper headers for MCP
  const fetchWithPayment = async (input: RequestInfo, init: RequestInit) => {
    // WORKAROUND: x402-fetch has a bug where it doesn't properly preserve Headers objects
    // when retrying requests after 402 responses. The spread operator ...init.headers
    // doesn't work with Headers objects - it spreads methods instead of key-value pairs.
    // This causes critical headers like 'Accept: application/json, text/event-stream' to be lost.
    // See: x402-fetch/src/index.ts line ~41: ...init.headers || {}
    // This workaround converts Headers to a plain object to ensure headers are preserved.
    // Fix submitted: https://github.com/coinbase/x402/pull/314
    const headers = {
      ...convertHeaders(init?.headers),
      // MCP's StreamableHTTPClientTransport already sets this, but we ensure it's present
      Accept: 'application/json, text/event-stream',
    };

    const response = await x402Fetch(input, {
      ...init,
      headers,
    });

    // Log payment information if available
    const paymentResponse = response.headers.get('X-PAYMENT-RESPONSE');
    if (paymentResponse) {
      try {
        const decoded = JSON.parse(atob(paymentResponse));
        if (decoded.txHash) {
          paymentCallback(decoded.txHash);
        }
      } catch (e) {
        console.error('❌ Failed to decode payment response:', e);
      }
    }

    return response;
  };

  // Create and return transport with x402-enabled fetch
  return new StreamableHTTPClientTransport(new URL(serverUrl), {
    fetch: fetchWithPayment as typeof fetch,
  });
}
