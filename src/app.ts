import { config as dotenvConfig } from "dotenv";
import path from "path";
import express, { Express } from "express";
import * as service from "./service.js";
import { extractFromAuthHeader } from "./util.js";
import {createMcpServer} from "./mcp.js";
import cors from "cors";
import { paymentMiddleware } from "x402-express";
import { config } from "./config.js";
import { createDynamicMcpPaymentMiddleware } from "./x402Integration.js";

// Load environment variables
dotenvConfig({ path: path.join(process.cwd(), ".env") });

const app: Express = express();

app.use(express.json());
app.use(cors());

// Apply payment middleware
app.use(paymentMiddleware(
  config.payment.walletAddress,
  config.payment.pricing,
  {
    url: config.payment.facilitatorUrl,
  }
));

app.get("/todo/:username", (req, res) => {
  const { username } = req.params;
  const todos = service.getTodos(username);
  res.json(todos);
});

app.post("/todo", (req, res) => {
  const userId = extractFromAuthHeader(req);
  const todo = service.createTodo(userId, req.body.todo);
  res.status(201).json(todo);
});

app.delete("/todo/:username/:index", (req, res) => {
  const { username, index: indexStr } = req.params;
  const index = parseInt(indexStr);
  const success = service.deleteTodo(username, index);
  res.status(success ? 200 : 404).json({ success });
});

app.post("/mcp", createDynamicMcpPaymentMiddleware(), async (req, res) => {
  const { transport, mcpServer } = await createMcpServer();

  await transport.handleRequest(req, res, req.body);

  res.on('close', () => {
    transport.close();
    mcpServer.close();
  })
})

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.error(`Todo app listening on port ${port}`));
