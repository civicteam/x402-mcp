#!/usr/bin/env node
import { config } from 'dotenv';
import path from 'path';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import type { Wallet } from 'x402/types';
import { createClientProxy } from '../../src/index.js';

// Load environment variables
config({ path: path.join(process.cwd(), '.env') });

/**
 * Example demonstrating a client-side proxy that handles x402 payments
 * on behalf of MCP clients that don't support the payment protocol.
 *
 * This proxy allows tools like Claude to connect to x402-enabled MCP servers
 * by handling the payment challenges transparently.
 */
async function main() {
  const PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY as `0x${string}`;
  const TARGET_MCP_URL = process.env.TARGET_MCP_URL || 'http://localhost:3022/mcp';
  const PROXY_MODE = process.env.CLIENT_PROXY_MODE || 'http';
  const PROXY_PORT = parseInt(process.env.CLIENT_PROXY_PORT || '4000');

  // Check if stdio mode is requested via command line argument
  const useStdio = process.argv.includes('--stdio') || PROXY_MODE === 'stdio';

  // Use console.error for all logs in stdio mode to avoid interfering with MCP protocol on stdout
  const log = useStdio ? console.error : console.log;

  if (!PRIVATE_KEY) {
    console.error('❌ No private key found!');
    console.error("\nPlease run 'pnpm generate-wallet' to create a new wallet");
    console.error('or add SENDER_PRIVATE_KEY to your .env file');
    process.exit(1);
  }

  try {
    log('=== X402 Client Proxy ===\n');

    // Create wallet client for payments
    const account = privateKeyToAccount(PRIVATE_KEY);
    const wallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    }).extend(publicActions) as Wallet;

    log('💰 Payment wallet:', account.address);
    log('🌐 Network: Base Sepolia');
    log('🎯 Target server:', TARGET_MCP_URL);
    log('📡 Proxy mode:', useStdio ? 'stdio' : 'http');

    if (!useStdio) {
      log('🔌 Proxy port:', PROXY_PORT);
    }

    // Create and start the proxy
    const proxy = await createClientProxy(
      useStdio
        ? {
            targetUrl: TARGET_MCP_URL,
            wallet,
            mode: 'stdio',
          }
        : {
            targetUrl: TARGET_MCP_URL,
            wallet,
            mode: 'http',
            port: PROXY_PORT,
          }
    );

    if (useStdio) {
      log('\n✅ Client proxy started in stdio mode');
      log('\nThe proxy is now listening on stdin/stdout.');
      log('You can configure your MCP client to use this process via stdio.');
    } else {
      log(`\n✅ Client proxy started on http://localhost:${PROXY_PORT}/mcp`);
      log('\nYou can now configure your MCP client (e.g., Claude) to connect to:');
      log(`  http://localhost:${PROXY_PORT}/mcp`);
    }

    log('\nThe proxy will handle x402 payments automatically using your wallet.');
    log('\nPress Ctrl+C to stop the proxy...');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      // Always use stderr for shutdown message
      console.error('\n\nShutting down proxy...');
      await proxy.stop();
      process.exit(0);
    });
  } catch (error: any) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
