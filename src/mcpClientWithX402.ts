import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";
import { convertHeaders } from "./util.js";

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
  const x402Fetch = wrapFetchWithPayment(fetch, walletClient as any);

  // Create a wrapper that ensures proper headers for MCP
  const fetchWithPayment = async (input: RequestInfo, init: RequestInit) => {
    // WORKAROUND: x402-fetch has a bug where it doesn't properly preserve Headers objects
    // when retrying requests after 402 responses. The spread operator ...init.headers
    // doesn't work with Headers objects - it spreads methods instead of key-value pairs.
    // This causes critical headers like 'Accept: application/json, text/event-stream' to be lost.
    // See: x402-fetch/src/index.ts line ~41: ...init.headers || {}
    // This workaround converts Headers to a plain object to ensure headers are preserved.
    // Fix submitted: https://github.com/coinbase/x402/pull/314
    const headers = {
      ...convertHeaders(init?.headers),
      // MCP's StreamableHTTPClientTransport already sets this, but we ensure it's present
      'Accept': 'application/json, text/event-stream'
    };

    const response = await x402Fetch(input, {
      ...init,
      headers,
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

