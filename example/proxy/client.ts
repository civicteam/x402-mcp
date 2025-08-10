#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env file
config({ path: path.join(process.cwd(), '.env') });

/**
 * Example demonstrating an MCP client connecting through the x402 client proxy.
 *
 * This shows how a standard MCP client (without x402 support) can access
 * x402-enabled servers by connecting through the client proxy, which handles
 * all payment challenges transparently.
 *
 * Prerequisites:
 * 1. Start the MCP server: pnpm start
 * 2. Start the client proxy: pnpm example:client-proxy
 * 3. Run this client: pnpm example:client-proxy:run
 */
async function main() {
  // Connect to the proxy instead of the actual server
  const PROXY_URL = process.env.CLIENT_PROXY_URL || 'http://localhost:4000/mcp';

  try {
    console.log('=== MCP Client via X402 Proxy ===\n');
    console.log('🔌 Connecting to proxy:', PROXY_URL);
    console.log('   (The proxy will handle x402 payments transparently)\n');

    // Create a standard HTTP transport - no payment capabilities needed!
    const transport = new StreamableHTTPClientTransport(new URL(PROXY_URL));

    // Create MCP client
    const client = new Client({ name: 'proxy-example-client', version: '1.0.0' }, { capabilities: {} });

    // Connect to the proxy
    await client.connect(transport);
    console.log('✅ Connected to MCP server through x402 proxy!');

    // List available tools
    console.log('\n📋 Available Tools:');
    const tools = await client.listTools();
    tools.tools.forEach((tool) => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    // Call tools - the proxy handles payments automatically
    console.log('\n🔧 Calling Tools (proxy handles payments):\n');

    // List todos (costs $0.001 - paid by proxy)
    console.log('1. Listing todos...');
    const listResult = await client.callTool({
      name: 'list-todos',
      arguments: {},
    });
    console.log('   Result:', JSON.stringify(listResult.content, null, 2));

    // Add a todo (costs $0.002 - paid by proxy)
    console.log('\n2. Adding a todo...');
    const addResult = await client.callTool({
      name: 'add-todo',
      arguments: {
        todo: 'Test todo via proxy',
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

    // Delete the todo (costs $0.001 - paid by proxy)
    console.log('\n4. Deleting todo at index 0...');
    const deleteResult = await client.callTool({
      name: 'delete-todo',
      arguments: {
        index: 0,
      },
    });
    console.log('   Result:', JSON.stringify(deleteResult.content, null, 2));

    // Final list to confirm deletion
    console.log('\n5. Final todo list...');
    const listResult3 = await client.callTool({
      name: 'list-todos',
      arguments: {},
    });
    console.log('   Result:', JSON.stringify(listResult3.content, null, 2));

    // Close the client
    await client.close();
    console.log('\n✅ Client disconnected successfully');
    console.log('\n💡 All payments were handled transparently by the proxy!');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message || error);

    if (error.message?.includes('ECONNREFUSED')) {
      console.error('\n💡 Make sure the client proxy is running:');
      console.error('   Run: pnpm example:client-proxy');
    }

    process.exit(1);
  }
}

// Run the example
main().catch(console.error);
