import { config as dotenvConfig } from "dotenv";
import path from "path";
import {Address} from "viem";

// Load environment variables before defining config
dotenvConfig({ path: path.join(process.cwd(), ".env") });

type Network = "base-sepolia" | "base" | "avalanche-fuji" | "avalanche" | "iotex";

export const config = {
  payment: {
    walletAddress: (process.env.RECEIVER_WALLET_ADDRESS || '0x0000000000000000000000000000000000000000') as Address,
    network: (process.env.PAYMENT_NETWORK || 'base-sepolia') as Network,
    facilitatorUrl: (process.env.FACILITATOR_URL || 'https://x402.org/facilitator') as `${string}://${string}`,
    pricing: {
      'GET /todo/:username': {
        price: '$0.001',
        network: (process.env.PAYMENT_NETWORK || 'base-sepolia') as Network,
      },
      'POST /todo': {
        price: '$0.002',
        network: (process.env.PAYMENT_NETWORK || 'base-sepolia') as Network,
      },
      'DELETE /todo/:username/:index': {
        price: '$0.001',
        network: (process.env.PAYMENT_NETWORK || 'base-sepolia') as Network,
      },
    },
    mcpPricing: {
      'list-todos': '$0.001',
      'add-todo': '$0.002',
      'delete-todo': '$0.001',
    }
  },
};
