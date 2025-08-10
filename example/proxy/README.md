# X402 MCP Proxy Examples

This directory contains examples of using the x402 MCP proxy functionality.

## Client Proxy

The client proxy enables MCP clients that don't support x402 payments (like Claude) to connect to x402-enabled MCP servers. The proxy handles payment challenges transparently using a configured wallet.

### Use Case
You want to use an MCP client (like Claude) that doesn't support x402 payments to access a paid MCP server.

### Setup

#### HTTP Mode (default)
```bash
# Configure environment variables
SENDER_PRIVATE_KEY=0x...  # Your wallet private key for payments
TARGET_MCP_URL=http://paid-server.com/mcp  # The x402-enabled server
CLIENT_PROXY_PORT=4000  # Port for the proxy (optional)

# Run the proxy
tsx example/proxy/client-proxy.ts
# Or
pnpm example:client-proxy
```

Configure your MCP client to connect to `http://localhost:4000/mcp` instead of the target server directly.

#### Stdio Mode
```bash
# Configure environment variables
SENDER_PRIVATE_KEY=0x...  # Your wallet private key for payments
TARGET_MCP_URL=http://paid-server.com/mcp  # The x402-enabled server

# Run the proxy in stdio mode
tsx example/proxy/client-proxy.ts --stdio
# Or
pnpm example:client-proxy:stdio
```

Configure your MCP client to use the proxy process via stdio transport.

### Testing the Client Proxy

To test that the client proxy is working correctly:

```bash
# Terminal 1: Start the MCP server
pnpm start

# Terminal 2: Start the client proxy
pnpm example:client-proxy

# Terminal 3: Run the test client
pnpm example:client-proxy:run
```

The test client (`example/proxy/client.ts`) demonstrates a standard MCP client connecting through the proxy without any x402 payment code. The proxy handles all payment challenges transparently.

## Server Proxy

The server proxy allows you to monetize access to API-key-protected MCP servers by accepting x402 payments instead of managing API keys for users.

### Use Case
You have an API key for an MCP server and want to resell access via micropayments.

### Setup
```bash
# Configure environment variables
UPSTREAM_MCP_URL=http://api-protected-server.com/mcp  # The upstream server
UPSTREAM_API_KEY=sk-xxxxx  # Your API key for the upstream server
PAYMENT_WALLET_ADDRESS=0x...  # Wallet to receive payments
SERVER_PROXY_PORT=5000  # Port for the proxy (optional)
TOOL_PRICING='{"tool1":"$0.01","tool2":"$0.02"}'  # Pricing per tool

# Run the proxy
tsx example/proxy/server-proxy.ts
```

### Usage
Clients can connect to `http://localhost:5000/mcp` and pay per tool call instead of needing an API key.

## Architecture

```
Client Proxy:
[MCP Client] → [Client Proxy + Wallet] → [X402 MCP Server]
                     ↓
              Handles payments

Server Proxy:
[X402 Client] → [Server Proxy] → [API-Protected MCP Server]
       ↓              ↓                    ↑
   Pays $0.01    Validates payment    Adds API key
```