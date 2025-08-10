import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import cors from 'cors';
import express, { type Express } from 'express';
import z from 'zod';
import { makePaymentAwareServerTransport } from '../src/index.js';
import { config } from './config.js';
import * as service from './service.js';

async function createMcpServer() {
  const mcpServer = new McpServer({
    name: 'Todo app',
    version: '0.0.1',
  });

  mcpServer.tool(
    'list-todos',
    `List all the current todos (requires payment: ${config.payment.mcpPricing['list-todos']})`,
    {},
    async (_input, extra) => {
      const user = extra.authInfo?.extra?.sub as string;
      const todos = service.getTodos(user);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(todos),
          },
        ],
      };
    }
  );

  mcpServer.tool(
    'add-todo',
    `Add a todo (requires payment: ${config.payment.mcpPricing['add-todo']})`,
    {
      todo: z.string().describe('The content of the todo to be added'),
    },
    async ({ todo }, extra) => {
      const user = extra.authInfo?.extra?.sub as string;
      service.createTodo(user, todo);
      return {
        content: [
          {
            type: 'text',
            text: `Added ${todo}`,
          },
        ],
      };
    }
  );

  mcpServer.tool(
    'delete-todo',
    `Delete a todo by index (requires payment: ${config.payment.mcpPricing['delete-todo']})`,
    {
      index: z.number().describe('The index of the todo to be removed (zero-indexed)'),
    },
    async ({ index }, extra) => {
      const user = extra.authInfo?.extra?.sub as string;
      service.deleteTodo(user, index);
      return {
        content: [
          {
            type: 'text',
            text: `Removed todo at ${index}`,
          },
        ],
      };
    }
  );

  // Create X402 transport with payment configuration
  const transport = makePaymentAwareServerTransport(config.payment.walletAddress, config.payment.mcpPricing);

  await mcpServer.connect(transport);

  return { transport, mcpServer };
}

const app: Express = express();

app.use(express.json());
app.use(cors());

// Create singleton MCP server instance
let mcpInstance: { transport: any; mcpServer: any } | null = null;

async function getMcpInstance() {
  if (!mcpInstance) {
    console.log('🚀 Creating MCP server singleton instance');
    mcpInstance = await createMcpServer();
  }
  return mcpInstance;
}

app.post('/mcp', async (req, res) => {
  const { transport } = await getMcpInstance();

  await transport.handleRequest(req, res, req.body);
});

const port = process.env.PORT ?? 3022;
app.listen(port, () => console.error(`Todo MCP Server listening on port ${port}`));
