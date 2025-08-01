import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { wrapFetchWithPayment } from "@ecdysis/x402-fetch";

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
  const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);

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
      fetch: fetchWithPayment as any, // x402 fetch is compatible with FetchLike
    }
  );

  // Connect the client
  await client.connect(transport);

  return client;
}

