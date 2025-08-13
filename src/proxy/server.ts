import { createPassthroughProxy, type PassthroughProxy } from '@civic/passthrough-mcp-server';
import type { StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Address } from 'viem';
import { makePaymentAwareServerTransport } from '../server.js';
import { ApiKeyHook } from './hooks/apiKeyHook.js';

/**
 * Creates a server-side proxy that:
 * 1. Accepts x402 payments from clients
 * 2. Adds an API key to authenticate with the upstream MCP server
 *
 * This allows monetizing access to API-key-protected MCP servers via micropayments.
 *
 * @param upstreamUrl - The URL of the API-key-protected MCP server to proxy to
 * @param apiKey - The API key to authenticate with the upstream server
 * @param paymentWallet - The wallet address to receive payments
 * @param toolPricing - Mapping of tool names to prices (e.g., { "my-tool": "$0.01" })
 * @param port - The port for the proxy to listen on (default: 5000)
 * @returns The proxy instance
 */
export async function createServerProxy(
  upstreamUrl: string,
  apiKey: string,
  paymentWallet: Address | string,
  toolPricing: Record<string, string>
): Promise<PassthroughProxy> {
  // Create the payment-aware server transport
  const paymentAwareTransport = makePaymentAwareServerTransport(paymentWallet, toolPricing);

  // Create the API key hook
  const apiKeyHook = new ApiKeyHook(apiKey);

  // Create and return the proxy
  return createPassthroughProxy({
    source: {
      transportType: 'httpStream',
      port: 5000,
      transportFactory: (_options: StreamableHTTPServerTransportOptions) => paymentAwareTransport,
    },
    target: {
      url: upstreamUrl,
      transportType: 'httpStream',
    },
    hooks: [apiKeyHook],
    autoStart: true,
  });
}
