import { config } from './config.js';

interface McpRequest {
  jsonrpc: string;
  method: string;
  params: {
    name: string;
  };
  id: string | number;
}

export const extractToolNameFromMcpRequest = (body: any): string | null => {
  try {
    const mcpRequest = body as McpRequest;

    // Handle tool call requests
    if (mcpRequest.method === 'tools/call') {
      return mcpRequest.params.name;
    }

    return null;
  } catch {
    return null;
  }
};

export const getMcpToolPrice = (toolName: string): string | null => config.payment.mcpPricing[toolName as keyof typeof config.payment.mcpPricing] || null;
