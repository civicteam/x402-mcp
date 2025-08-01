import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import * as service from "./service.js";
import z from "zod";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";

export async function createMcpServer() {
  const mcpServer = new McpServer({
    name: "Todo app",
    version: "0.0.1",
  })

  mcpServer.tool(
      "list-todos",
      `List all the current todos (requires payment: ${config.payment.mcpPricing['list-todos']})`,
      {},
      async (input, extra) => {
        const user = extra.authInfo?.extra?.sub as string;
        const todos = service.getTodos(user);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(todos),
          }]
        }
      }
  )

  mcpServer.tool(
      "add-todo",
      `Add a todo (requires payment: ${config.payment.mcpPricing['add-todo']})`,
      {
        todo: z.string().describe("The content of the todo to be added")
      },
      async ({todo}, extra) => {
        const user = extra.authInfo?.extra?.sub as string;
        service.createTodo(user, todo);
        return {
          content: [{
            type: "text",
            text: `Added ${todo}`
          }]
        }
      }
  )

  mcpServer.tool(
      "delete-todo",
      `Delete a todo by index (requires payment: ${config.payment.mcpPricing['delete-todo']})`,
      {
        index: z.number().describe("The index of the todo to be removed (zero-indexed)")
      },
      async ({index}, extra) => {
        const user = extra.authInfo?.extra?.sub as string;
        service.deleteTodo(user, index);
        return {
          content: [{
            type: "text",
            text: `Removed todo at ${index}`
          }]
        }
      }
  )

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  })

  await mcpServer.connect(transport);

  return {transport, mcpServer};
}

export async function runMcpServer() {
  const {mcpServer, transport} = await createMcpServer();
  // The server is already connected via createMcpServer
  console.log("MCP server running in standalone mode");
}
