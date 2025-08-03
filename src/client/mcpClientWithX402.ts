import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { wrapFetchWithPayment } from "@ecdysis/x402-fetch";
import {RequestInfo} from "@modelcontextprotocol/sdk/types.js";

/**
 * Creates an MCP client with x402 payment capabilities
 * Uses the standard MCP SDK with a custom fetch implementation
 */
export async function createMcpClientWithX402(options: {
  serverUrl: string;
  privateKey: `0x${string}`;
  network?: "base-sepolia" | "base";
  rpcUrl?: string;
  clientName?: string;
  clientVersion?: string;
}): Promise<Client> {
  const {
    serverUrl,
    privateKey,
    network = "base-sepolia",
    rpcUrl,
    clientName = "x402-mcp-client",
    clientVersion = "1.0.0"
  } = options;

  // Set up wallet client for x402 payments
  const account = privateKeyToAccount(privateKey);
  const chain = network === "base" ? base : baseSepolia;

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl || (network === "base" ? "https://mainnet.base.org" : "https://sepolia.base.org")),
  });

  console.log("Setting up x402 MCP client");
  console.log("Wallet address:", account.address);
  console.log("Network:", network);

  // Create x402-enabled fetch
  const x402Fetch = wrapFetchWithPayment(fetch, walletClient);

  // Create a wrapper that ensures proper headers for MCP
  const fetchWithPayment = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Convert headers to a plain object to ensure they survive the x402 retry
    const headers = new Headers(init?.headers);

    // StreamableHTTP requires both application/json and text/event-stream
    const acceptHeader = headers.get('Accept') || '';
    if (!acceptHeader.includes('text/event-stream')) {
      headers.set('Accept', 'application/json, text/event-stream');
    }

    // Convert Headers to plain object for x402-fetch compatibility
    const headersObject: Record<string, string> = {};
    headers.forEach((value, key) => {
      headersObject[key] = value;
    });

    const response = await x402Fetch(input, {
      ...init,
      headers: headersObject,
    });

    // Log payment information if available
    const paymentResponse = response.headers.get('X-PAYMENT-RESPONSE');
    if (paymentResponse) {
      console.log('\n💰 Payment made:');
      console.log('   Response:', paymentResponse);
      try {
        const decoded = JSON.parse(atob(paymentResponse));
        console.log('   Decoded:', decoded);
        if (decoded.txHash) {
          console.log('   Transaction Hash:', decoded.txHash);
        }
      } catch (e) {
        // Failed to decode, just log raw value
      }
    }

    return response;
  };

  // Create MCP client with standard SDK
  const client = new Client(
    {
      name: clientName,
      version: clientVersion,
    },
    {
      capabilities: {},
    }
  );

  // Create transport with x402-enabled fetch
  const transport = new StreamableHTTPClientTransport(
    new URL(serverUrl),
    {
      fetch: fetchWithPayment as any,
    }
  );

  // Connect the client
  await client.connect(transport);

  return client;
}

