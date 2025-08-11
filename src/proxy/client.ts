import {
  createHttpPassthroughProxy,
  createStdioPassthroughProxy,
  type HttpProxyConfig,
  type PassthroughProxy,
  type StdioProxyConfig,
} from '@civic/passthrough-mcp-server';
import type { Wallet } from 'x402/types';
import { makePaymentAwareClientTransport } from '../client.js';

/**
 * Creates a client-side proxy that handles x402 payments on behalf of MCP clients
 * that don't support payment protocols.
 *
 * @param params - Configuration for the proxy
 * @param params.targetUrl - The URL of the x402-enabled MCP server to proxy to
 * @param params.walletClient - A viem WalletClient configured with account and chain for payments
 * @param params.mode - 'stdio' for stdio transport or 'http' for HTTP transport
 * @param params.port - The port for the proxy to listen on (only for HTTP mode, default: 4000)
 * @returns The proxy instance
 */
export async function createClientProxy(
  params: {
    targetUrl: string;
    wallet: Wallet;
  } & (
    | {
        mode: 'stdio';
      }
    | {
        mode: 'http';
        port?: number;
      }
  )
): Promise<PassthroughProxy> {
  // Create the payment-aware transport for the target
  const paymentAwareTransport = makePaymentAwareClientTransport(params.targetUrl, params.wallet);

  if (params.mode === 'stdio') {
    // Create stdio proxy configuration
    const config: StdioProxyConfig = {
      target: {
        transportType: 'custom',
        transportFactory: () => paymentAwareTransport,
      },
    };

    return createStdioPassthroughProxy(config);
  } else {
    // Create HTTP proxy configuration
    const config: HttpProxyConfig = {
      port: params.port ?? 4000,
      target: {
        transportType: 'custom',
        transportFactory: () => paymentAwareTransport,
      },
    };

    return createHttpPassthroughProxy(config);
  }
}
