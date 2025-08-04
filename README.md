# X402 MCP Integration

A server and client implementation for integrating X402 payment protocol with Model Context Protocol (MCP), enabling micropayments for MCP tool invocations.

## Quick Start

Enable micropayments for your MCP tools with X402 - get paid in USDC for every tool invocation.

**Server**: Charge for tool usage
```typescript
const transport = makePaymentAwareServerTransport(
  "0x123...",
  { "my-tool": "$0.01" }
);
await mcpServer.connect(transport);
```

**Client**: Automatic payment handling
```typescript
const transport = makePaymentAwareClientTransport(
  "http://localhost:3000/mcp",
  walletClient
);
await mcpClient.connect(transport);
```

## What is X402?

X402 is an open payment protocol developed by Coinbase that enables instant, automatic stablecoin payments directly over HTTP. It revives the HTTP 402 Payment Required status code to create a simple, programmatic payment flow:

1. Client requests a resource from the server
2. Server responds with 402 status and payment requirements
3. Client constructs and sends a payment payload
4. Server verifies and settles the payment via a facilitator
5. Server returns the requested resource

Key features:
- Programmatic payments without accounts or complex authentication
- Direct onchain payments with minimal setup
- Machine-to-machine transaction support
- Micropayments and usage-based billing

Learn more: https://x402.org

## What is MCP?

Model Context Protocol (MCP) is an open protocol that standardizes how applications provide context to AI models. It enables:

- Standardized server implementations exposing tools and resources
- Client libraries for connecting to MCP servers  
- Transport layers for communication between clients and servers
- Tool invocation patterns for AI models to interact with external systems

Learn more: https://modelcontextprotocol.io/overview

## How MCP Works with Streaming HTTP

MCP supports multiple transport mechanisms, including HTTP with Server-Sent Events (SSE) for streaming responses. The protocol uses JSON-RPC 2.0 for message exchange:

1. Client sends JSON-RPC requests to the server
2. Server can respond with:
   - Single JSON response (when `enableJsonResponse: true`)
   - SSE stream for real-time updates and multiple responses
3. Messages flow bidirectionally using the chosen transport

## Integrating MCP and X402

This library integrates X402 payments into MCP by:

1. **Server-side**: Wrapping the MCP `StreamableHTTPServerTransport` to intercept tool calls and require payments
2. **Client-side**: Using a custom fetch implementation that automatically handles 402 responses and payment flows

**Important caveat**: The integration currently disables SSE streaming by setting `enableJsonResponse: true` in the transport configuration. This is because X402 payment verification happens at the HTTP request level, before the SSE stream is established. See `@modelcontextprotocol/sdk/server/streamableHttp.d.ts` line 53 for details.

## Installation

```bash
npm install @civic/x402-mcp
```

## Usage

### Server Setup

Create a payment-aware transport for your MCP server:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makePaymentAwareServerTransport } from "@civic/x402-mcp";

// Create MCP server
const server = new McpServer({
  name: "my-server",
  version: "1.0.0"
});

// Define your tools
server.tool(
  "expensive-tool",
  ...
);

// Create payment-aware transport
const transport = makePaymentAwareServerTransport(
  "0x...", // Your wallet address to receive payments
  { 
    "expensive-tool": "$0.010",
    "another-tool": "$0.002"
  }
);

// Connect with payment-aware transport
await server.connect(transport);
```

### Client Setup  

Create a payment-aware transport for your MCP client:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { makePaymentAwareClientTransport } from "@civic/x402-mcp";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// Set up your wallet client
const walletClient = createWalletClient({
  account: privateKeyToAccount("0x..."),
  chain: baseSepolia,
  transport: http()
});

// Create payment-aware transport
const transport = makePaymentAwareClientTransport(
  "http://localhost:3000/mcp",
  walletClient
);

// Use with any MCP client
const client = new Client(
  { name: "my-client", version: "1.0.0" },
  { capabilities: {} }
);
await client.connect(transport);
```

## License

MIT
