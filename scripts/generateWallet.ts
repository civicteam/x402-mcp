#!/usr/bin/env node
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

async function generateWallet() {
  // Generate a new private key
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  // Output to stdout
  console.log(`PRIVATE_KEY=${privateKey}
WALLET_ADDRESS=${account.address}
PAYMENT_NETWORK=base-sepolia
FACILITATOR_URL=https://x402.org/facilitator
MCP_SERVER_URL=http://localhost:3000/mcp`);
}

generateWallet().catch(console.error);
