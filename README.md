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
- `WALLET_ADDRESS` - Your wallet address to receive payments
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