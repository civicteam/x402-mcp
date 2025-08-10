import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import type { Address } from 'viem';

// Load environment variables before defining config
dotenvConfig({ path: path.join(process.cwd(), '.env') });

type Network = 'base-sepolia' | 'base';

const walletAddress = process.env.RECEIVER_WALLET_ADDRESS as Address;
const network = process.env.PAYMENT_NETWORK as Network;
const facilitatorUrl = process.env.FACILITATOR_URL as `${string}://${string}`;

export const config = {
  payment: {
    walletAddress,
    network,
    facilitatorUrl,
    mcpPricing: {
      'list-todos': '$0.001',
      'add-todo': '$0.002',
      'delete-todo': '$0.001',
    },
  },
};
