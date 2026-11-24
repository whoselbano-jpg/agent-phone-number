#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mcpTools, callTool, redact } from "@agent-phone-number/core";

const INSTRUCTIONS = [
  "Twilio phone tools. The owner must create the Twilio account and verify recipient numbers in the Twilio Console.",
  "Never ask for credentials, verification codes, or card details in chat.",
  "Twilio trial accounts can call and text only verified numbers; do not bypass that restriction.",
  "Calls, SMS, number purchases, routing changes, and admin actions require confirm:true and host approval.",
  "Set TWILIO_DRY_RUN=1 for read-only mode. Use twilio_setup_guide for install steps.",
].join(" ");

const server = new Server(
  { name: "agent-phone-number", version: "0.2.0", instructions: INSTRUCTIONS },
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
          text: `Twilio tool error: ${redact(error?.message || String(error), [process.env.TWILIO_AUTH_TOKEN, process.env.TWILIO_API_SECRET])}`,
        },
      ],
      isError: true,
    };
  }
});

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(
    `${redact(error?.message || String(error), [process.env.TWILIO_AUTH_TOKEN, process.env.TWILIO_API_SECRET])}\n`,
  );
  process.exitCode = 1;
}
