#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { config } from 'dotenv';
import path from 'path';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import type { Wallet } from 'x402/types';
import { makePaymentAwareClientTransport } from '../src/index.js';

// Load environment variables from .env file
config({ path: path.join(process.cwd(), '.env') });

/**
 * Example demonstrating MCP client with x402 payments
 */

async function main() {
  const PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY as `0x${string}`;
  const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000/mcp';

  if (!PRIVATE_KEY) {
    console.error('❌ No private key found!');
    console.error("\nPlease run 'pnpm generate-wallet' to create a new wallet");
    console.error('or add SENDER_PRIVATE_KEY to your .env file');
    process.exit(1);
  }

  try {
    console.log('=== MCP Client with X402 Payment Support ===\n');

    // Create wallet client
    const account = privateKeyToAccount(PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    }).extend(publicActions);

    console.log('💰 Wallet address:', account.address);
    console.log('🌐 Network: Base Sepolia');

    // Create payment-aware transport
    const transport = makePaymentAwareClientTransport(MCP_SERVER_URL, walletClient as Wallet);

    // Create MCP client
    const client = new Client({ name: 'example-client', version: '1.0.0' }, { capabilities: {} });

    // Connect with payment-aware transport
    await client.connect(transport);

    console.log('✅ Connected to MCP server with x402 payment support!');

    // List available tools
    console.log('\n📋 Available Tools:');
    const tools = await client.listTools();
    tools.tools.forEach((tool) => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    // Call tools - payments will be handled automatically
    console.log('\n💰 Calling Tools with Automatic Payment:\n');

    // List todos (costs $0.001)
    console.log('1. Listing todos...');
    const listResult = await client.callTool({
      name: 'list-todos',
      arguments: {},
    });
    console.log('   Result:', JSON.stringify(listResult.content, null, 2));
    if ((listResult as any).x402Settlement) {
      console.log('   💰 Payment settled:', (listResult as any).x402Settlement);
    }

    // Add a todo (costs $0.002)
    console.log('\n2. Adding a todo...');
    const addResult = await client.callTool({
      name: 'add-todo',
      arguments: {
        todo: 'Buy groceries with x402 payment',
      },
    });
    console.log('   Result:', JSON.stringify(addResult.content, null, 2));

    // List todos again to see the new one
    console.log('\n3. Listing todos again...');
    const listResult2 = await client.callTool({
      name: 'list-todos',
      arguments: {},
    });
    console.log('   Result:', JSON.stringify(listResult2.content, null, 2));

    // Delete the todo (costs $0.001)
    console.log('\n4. Deleting todo at index 0...');
    const deleteResult = await client.callTool({
      name: 'delete-todo',
      arguments: {
        index: 0,
      },
    });
    console.log('   Result:', JSON.stringify(deleteResult.content, null, 2));

    // Close the client
    await client.close();
    console.log('\n✅ Client disconnected successfully');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message || error);

    // Check if it's an insufficient funds error
    if (error.message?.includes('insufficient_funds')) {
      console.error('\n💰 Insufficient USDC balance!');
      console.error(`   Wallet: ${PRIVATE_KEY ? privateKeyToAccount(PRIVATE_KEY).address : 'Unknown'}`);
      console.error('   Network: Base Sepolia');
      console.error('   Token: USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e)');
      console.error('\n   To get testnet USDC:');
      console.error('   1. Bridge from Ethereum Sepolia');
      console.error('   2. Use a faucet that supports Base Sepolia USDC');
    }

    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
