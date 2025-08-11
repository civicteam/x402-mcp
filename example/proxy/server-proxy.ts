#!/usr/bin/env node
import { config } from 'dotenv';
import path from 'path';
import { getAddress } from 'viem';
import { createServerProxy } from '../../src/proxy/server.js';

// Load environment variables
config({ path: path.join(process.cwd(), '.env') });

/**
 * Example demonstrating a server-side proxy that:
 * 1. Accepts x402 payments from clients
 * 2. Adds an API key to authenticate with an upstream MCP server
 *
 * This allows you to monetize access to API-key-protected MCP servers
 * by charging micropayments instead of managing API keys for users.
 */
async function main() {
  const UPSTREAM_URL = process.env.UPSTREAM_MCP_URL || 'http://localhost:3001/mcp';
  const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY;
  const PAYMENT_WALLET = process.env.PAYMENT_WALLET_ADDRESS;
  const PROXY_PORT = parseInt(process.env.SERVER_PROXY_PORT || '5000');

  // Parse tool pricing from environment or use defaults
  const TOOL_PRICING = process.env.TOOL_PRICING
    ? JSON.parse(process.env.TOOL_PRICING)
    : {
        'list-todos': '$0.001',
        'add-todo': '$0.002',
        'delete-todo': '$0.001',
      };

  if (!UPSTREAM_API_KEY) {
    console.error('❌ No upstream API key found!');
    console.error('\nPlease add UPSTREAM_API_KEY to your .env file');
    process.exit(1);
  }

  if (!PAYMENT_WALLET) {
    console.error('❌ No payment wallet address found!');
    console.error('\nPlease add PAYMENT_WALLET_ADDRESS to your .env file');
    process.exit(1);
  }

  try {
    console.log('=== X402 Server Proxy ===\n');
    console.log('📡 Upstream server:', UPSTREAM_URL);
    console.log('🔑 API key configured:', `${UPSTREAM_API_KEY.substring(0, 10)}...`);
    console.log('💰 Payment wallet:', getAddress(PAYMENT_WALLET));
    console.log('🔌 Proxy port:', PROXY_PORT);
    console.log('\n💵 Tool pricing:');
    Object.entries(TOOL_PRICING).forEach(([tool, price]) => {
      console.log(`   - ${tool}: ${price}`);
    });

    // Create and start the proxy
    const proxy = await createServerProxy(UPSTREAM_URL, UPSTREAM_API_KEY, PAYMENT_WALLET, TOOL_PRICING);

    console.log(`\n✅ Server proxy started on http://localhost:${PROXY_PORT}/mcp`);
    console.log('\nClients can now connect to this proxy and pay for access to the upstream server.');
    console.log('The proxy will:');
    console.log('  1. Validate x402 payments from clients');
    console.log('  2. Add the API key to authenticate with the upstream server');
    console.log('  3. Forward requests and responses');
    console.log('\nPress Ctrl+C to stop the proxy...');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\nShutting down proxy...');
      await proxy.stop();
      process.exit(0);
    });
  } catch (error: any) {
    console.error('\n❌ Error:', error.message || error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
