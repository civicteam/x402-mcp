#!/usr/bin/env node
import { createClientProxy } from '../src/proxy/index.js';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import type { Wallet } from 'x402/types';

/**
 * Client proxy script for X402 MCP
 * 
 * Usage:
 *   TARGET_URL=http://server.com/mcp PRIVATE_KEY=0x... npx @civic/x402-mcp client-proxy
 *   
 * Environment variables:
 *   TARGET_URL - MCP server URL to proxy to (required)
 *   PRIVATE_KEY - Private key for wallet (required)
 *   MODE - Transport mode: "stdio" or "http" (default: stdio)
 *   PORT - Port for HTTP mode (default: 3000)
 *   NETWORK - Network to use (default: base-sepolia)
 */

async function main() {
  // Get configuration from environment
  const targetUrl = process.env.TARGET_URL;
  const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
  const mode = (process.env.MODE || 'stdio').toLowerCase();
  const port = parseInt(process.env.PORT || '3000');
  const network = process.env.NETWORK || 'base-sepolia';

  // Validate required parameters
  if (!targetUrl) {
    console.error('❌ Error: TARGET_URL environment variable is required');
    console.error('Usage: TARGET_URL=http://server.com/mcp PRIVATE_KEY=0x... npx @civic/x402-mcp client-proxy');
    process.exit(1);
  }

  if (!privateKey) {
    console.error('❌ Error: PRIVATE_KEY environment variable is required');
    console.error('Usage: TARGET_URL=http://server.com/mcp PRIVATE_KEY=0x... npx @civic/x402-mcp client-proxy');
    process.exit(1);
  }

  if (!privateKey.startsWith('0x')) {
    console.error('❌ Error: PRIVATE_KEY must start with 0x');
    process.exit(1);
  }

  if (mode !== 'stdio' && mode !== 'http') {
    console.error('❌ Error: MODE must be either "stdio" or "http"');
    process.exit(1);
  }

  // Set up wallet
  let chain;
  switch (network) {
    case 'base-sepolia':
    case 'baseSepolia':
      chain = baseSepolia;
      break;
    default:
      console.error(`❌ Error: Unsupported network: ${network}`);
      console.error('Supported networks: base-sepolia');
      process.exit(1);
  }

  try {
    const account = privateKeyToAccount(privateKey);
    const wallet = createWalletClient({
      account,
      chain,
      transport: http(),
    }).extend(publicActions);

    // Log configuration (to stderr in stdio mode)
    const logStream = mode === 'stdio' ? console.error : console.log;
    logStream('🚀 Starting X402 MCP Client Proxy');
    logStream(`📍 Target URL: ${targetUrl}`);
    logStream(`💳 Wallet: ${account.address}`);
    logStream(`🌐 Network: ${chain.name}`);
    logStream(`🔌 Mode: ${mode}`);
    if (mode === 'http') {
      logStream(`🔗 Port: ${port}`);
    }

    // Create and start proxy
    const proxy = await createClientProxy({
      targetUrl,
      wallet: wallet as Wallet,
      mode: mode as 'stdio' | 'http',
      port: mode === 'http' ? port : undefined,
    });

    if (mode === 'http') {
      console.log(`✅ Proxy running at http://localhost:${port}`);
      console.log('   Non-payment-aware MCP clients can connect to this URL');
      console.log('   Payments will be handled automatically');
      console.log('');
      console.log('Press Ctrl+C to stop');
    } else {
      // In stdio mode, the proxy is already handling stdin/stdout
      // Just keep the process running
      await new Promise(() => {}); // Keep process alive
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      if (mode === 'http') {
        console.log('\n👋 Shutting down proxy...');
      }
      await proxy.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await proxy.stop();
      process.exit(0);
    });
  } catch (error) {
    const logStream = mode === 'stdio' ? console.error : console.log;
    logStream('❌ Error starting proxy:', error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});