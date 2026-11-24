#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mcpTools, callTool, redact } from "@agent-phone-number/core";

const INSTRUCTIONS = [
  "Bland AI phone tools. The owner must approve signup and the Agent Phone Plan in a browser.",
  "Never ask for payment details or approve a purchase on the owner's behalf.",
  "Never place API keys, device codes, or verification codes in chat or files.",
  "Calls, SMS, batches, purchases, routing changes, and admin actions require confirm:true and host approval.",
  "Set BLAND_DRY_RUN=1 for read-only mode. Use bland_setup_guide for install steps.",
].join(" ");

const server = new Server(
  { name: "agent-phone-number", version: "0.1.0", instructions: INSTRUCTIONS },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools() }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params || {};
  try {
    const result = await callTool(name, args ?? {}, { env: process.env });
    const text =
      typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Bland tool error: ${redact(error?.message || String(error), [process.env.BLAND_API_KEY])}`,
        },
      ],
      isError: true,
    };
  }
});

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(`${redact(error?.message || String(error), [process.env.BLAND_API_KEY])}\n`);
  process.exitCode = 1;
}
