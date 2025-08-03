import express, { Express } from "express";
import { createMcpServer } from "./mcp.js";
import cors from "cors";

const app: Express = express();

app.use(express.json());
app.use(cors());

// Create singleton MCP server instance
let mcpInstance: { transport: any; mcpServer: any } | null = null;

async function getMcpInstance() {
  if (!mcpInstance) {
    console.log("🚀 Creating MCP server singleton instance");
    mcpInstance = await createMcpServer();
  }
  return mcpInstance;
}

app.post("/mcp", async (req, res) => {
  const { transport } = await getMcpInstance();
  
  await transport.handleRequest(req, res, req.body);
})

const port = process.env.PORT ?? 3022;
app.listen(port, () => console.error(`Todo MCP Server listening on port ${port}`));
