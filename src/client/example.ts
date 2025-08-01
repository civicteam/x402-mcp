#!/usr/bin/env node
import { createMcpClientWithX402 } from "./mcpClientWithX402.js";
import { config } from "dotenv";
import path from "path";

// Load environment variables from .env file
config({ path: path.join(process.cwd(), ".env") });

/**
 * Example demonstrating MCP client with x402 payments
 */

async function main() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
  const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3000/mcp";

  if (!PRIVATE_KEY) {
    console.error("❌ No private key found!");
    console.error("\nPlease run 'pnpm generate-wallet' to create a new wallet");
    console.error("or add PRIVATE_KEY to your .env file");
    process.exit(1);
  }

  try {
    console.log("=== MCP Client with X402 Payment Support ===\n");
    
    // Create client with x402 payments
    const client = await createMcpClientWithX402({
      serverUrl: MCP_SERVER_URL,
      privateKey: PRIVATE_KEY,
      network: "base-sepolia",
    });

    console.log("✅ Connected to MCP server with x402 payment support!");

    // List available tools
    console.log("\n📋 Available Tools:");
    const tools = await client.listTools();
    tools.tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    // Call tools - payments will be handled automatically
    console.log("\n💰 Calling Tools with Automatic Payment:\n");

    // List todos (costs $0.001)
    console.log("1. Listing todos...");
    const listResult = await client.callTool({
      name: "list-todos",
      arguments: {},
    });
    console.log("   Result:", JSON.stringify(listResult.content, null, 2));

    // Add a todo (costs $0.002)
    console.log("\n2. Adding a todo...");
    const addResult = await client.callTool({
      name: "add-todo",
      arguments: {
        todo: "Buy groceries with x402 payment",
      },
    });
    console.log("   Result:", JSON.stringify(addResult.content, null, 2));

    // List todos again to see the new one
    console.log("\n3. Listing todos again...");
    const listResult2 = await client.callTool({
      name: "list-todos",
      arguments: {},
    });
    console.log("   Result:", JSON.stringify(listResult2.content, null, 2));

    // Delete the todo (costs $0.001)
    console.log("\n4. Deleting todo at index 0...");
    const deleteResult = await client.callTool({
      name: "delete-todo",
      arguments: {
        index: 0,
      },
    });
    console.log("   Result:", JSON.stringify(deleteResult.content, null, 2));

    // Close the client
    await client.close();
    console.log("\n✅ Client disconnected successfully");

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

// Run the example
main().catch(console.error);