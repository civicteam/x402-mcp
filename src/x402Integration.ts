import { Request, Response, NextFunction } from 'express';
import { paymentMiddleware } from 'x402-express';
import { config } from './config.js';
import { extractToolNameFromMcpRequest, getMcpToolPrice } from './mcpPayment.js';

type Network = "base-sepolia" | "base" | "avalanche-fuji" | "avalanche" | "iotex";

// Create a dynamic payment middleware for MCP
export const createDynamicMcpPaymentMiddleware = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const toolName = extractToolNameFromMcpRequest(req.body);


    // Not a tool call, let it through
    if (!toolName) return next();

    const price = getMcpToolPrice(toolName);


    // No pricing defined for this tool
    if (!price) return next();

    // Create a dynamic pricing configuration for this specific request
    const dynamicPricing = {
      'POST /mcp': {
        price: price,
        network: config.payment.network as Network,
      }
    };

    // Apply X402 payment middleware with dynamic pricing
    const middleware = paymentMiddleware(
      config.payment.walletAddress,
      dynamicPricing,
      {
        url: config.payment.facilitatorUrl,
      }
    );

    // Execute the payment middleware
    await middleware(req, res, next);
  };
};
