# Todo MCP Server with X402 Payment Integration

A Model Context Protocol (MCP) server for managing todos with Coinbase X402 payment integration. This server can run in two modes:
- HTTP mode: Express server with REST API endpoints protected by X402 payment middleware
- MCP mode: MCP server that can be used with LLM tools

## Features

- Create todos for specific users
- List all todos for a user  
- Delete todos by index
- In-memory storage (resets on restart)
- X402 payment integration for API monetization
- Per-endpoint pricing configuration

## Installation

```bash
pnpm install
```

## Usage

### HTTP Mode (Default)

Start the Express server:

```bash
pnpm dev
```

The server will run on http://localhost:3000

#### API Endpoints

All endpoints are protected by X402 payment middleware:

- `GET /todo/:username` - Get all todos for a user (Cost: $0.001)
- `POST /todo` - Create a new todo (Cost: $0.002)
  - Body: `{ "todo": "string" }`
  - Requires `x-user-id` header
- `DELETE /todo/:username/:index` - Delete a todo by index (Cost: $0.001)

### MCP Mode

To run as an MCP server:

```bash
MODE=mcp pnpm start
```

Or use the MCP inspector:

```bash
npx @modelcontextprotocol/inspector dist/index.js
```

#### MCP Tools

The server exposes three MCP tools, each with payment requirements:
- `list-todos` - List all todos for a user (Cost: $0.001)
- `add-todo` - Create a new todo (Cost: $0.002)
- `delete-todo` - Delete a todo by index (Cost: $0.001)

MCP requests are handled through the `/mcp` endpoint with dynamic payment validation based on the tool being called.

## Development

Build TypeScript:

```bash
pnpm build
```

## Configuration

The server can be configured via environment variables:
- `PORT` - HTTP server port (default: 3000)
- `MODE` - Server mode: `http` or `mcp` (default: http)
- `RECEIVER_WALLET_ADDRESS` - Your wallet address to receive payments
- `PAYMENT_NETWORK` - Payment network: `base-sepolia` (testnet) or `base` (mainnet)
- `FACILITATOR_URL` - X402 facilitator URL

Copy `.env.example` to `.env` and update with your values:

```bash
cp .env.example .env
```

### Payment Configuration

The X402 payment middleware protects all todo endpoints with micropayments:
- List todos: $0.001 per request
- Create todo: $0.002 per request  
- Delete todo: $0.001 per request

For testnet:
- Network: `base-sepolia`
- Facilitator: `https://x402.org/facilitator`

For mainnet:
- Network: `base`
- Facilitator: `https://facilitator.coinbase.com/facilitator`

## X402 MCP Client

This project includes a client implementation that can call the MCP server with automatic X402 payment handling.

### How it Works

The client uses the standard MCP SDK with a custom fetch implementation provided by `@ecdysis/x402-fetch`:

1. Uses `StreamableHTTPClientTransport` with custom fetch option
2. Wraps standard fetch with x402 payment capabilities
3. Automatically handles 402 Payment Required responses
4. Creates payment transactions and retries requests with proof of payment

### Client Setup

1. Generate a new wallet (or use an existing one):
   ```bash
   pnpm generate-wallet
   ```
   This will generate a new private key using viem and output the configuration to stdout. Add these values to your `.env` file.
   
2. Fund your wallet with USDC on Base Sepolia (testnet) or Base (mainnet)
   - For testnet USDC, use a faucet or bridge from Ethereum Sepolia

3. Configure your `.env` file with:
   - `SENDER_PRIVATE_KEY` - Your wallet's private key (for sending payments as a client)
   - `SENDER_WALLET_ADDRESS` - Your wallet's address (for sending payments)
   - `RECEIVER_WALLET_ADDRESS` - Your wallet address to receive payments (as a server)
   - `PAYMENT_NETWORK` - Default: base-sepolia
   - `FACILITATOR_URL` - Default: https://x402.org/facilitator
   - `MCP_SERVER_URL` - Default: http://localhost:3000/mcp

### Running the Client Example

```bash
# Start the server first
pnpm dev

# In another terminal, run the client example
pnpm example
```

The example will:
1. Connect to the MCP server
2. List available tools and their prices
3. Call various tools (list-todos, add-todo, delete-todo)
4. Automatically handle payments for each tool call

### Client Implementation

The client implementation (`src/client/mcpClientWithX402.ts`) provides a `createMcpClientWithX402` function that:
- Creates a standard MCP SDK `Client` instance
- Configures `StreamableHTTPClientTransport` with x402-enabled fetch
- Returns a client that automatically handles payments

Example usage:
```typescript
import { createMcpClientWithX402 } from "./client/mcpClientWithX402.js";

const client = await createMcpClientWithX402({
  serverUrl: "http://localhost:3000/mcp",
  privateKey: "0x...",
  network: "base-sepolia",
});

// Use the client normally - payments are handled automatically
const result = await client.callTool({
  name: "list-todos",
  arguments: {},
});
```

### Troubleshooting

1. **Insufficient Balance**: Ensure your wallet has enough USDC to cover the tool costs
2. **Wrong Network**: Make sure your wallet is configured for the same network as the server (base-sepolia for testnet)
3. **Private Key**: The private key must start with "0x" and be 64 hex characters long
