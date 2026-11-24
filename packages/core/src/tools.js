import { BlandClient } from "./client.js";
import { classifyRequest } from "./endpoints.js";
import { loadCredentials } from "./credentials.js";
import { connectStart, connectPoll, disconnect } from "./onboarding.js";
import { credentialStatus } from "./credentials.js";
import { decide, assertAllowed, permissionAction, actionSummary, RISK_READ, RISK_WRITE, RISK_APPROVE, RISK_ADMIN } from "./safety.js";

const str = (description) => ({ type: "string", description });
const bool = (description) => ({ type: "boolean", description });
const obj = (description = "Object") => ({ type: "object", description, additionalProperties: true });
const pathParam = (description) => str(description);

function defineTool(definition) {
  const risk = definition.risk || RISK_APPROVE;
  const confirm = risk === RISK_APPROVE || risk === RISK_ADMIN || risk === "dynamic"
    ? {
        confirm: bool(
          "Required. Set true only after the owner approved this specific paid/live/destructive action.",
        ),
      }
    : {};
  return Object.freeze({
    ...definition,
    risk,
    input: {
      type: "object",
      properties: { ...(definition.input?.properties || {}), ...confirm },
      required: [...(definition.input?.required || []), ...(Object.keys(confirm).length ? ["confirm"] : [])],
      additionalProperties: false,
    },
  });
}

/** Build a handler that forwards to a documented Bland REST path. */
const call = (method, path, pathKeys = [], queryFromInput = false) =>
  async (input, ctx) => {
    const pathParams = Object.fromEntries(pathKeys.map((key) => [key, input[key]]));
    const result = await (await ctx.client()).request({
      method,
      path,
      pathParams,
      query: queryFromInput ? input.query : undefined,
      body: input.body,
      signal: ctx.signal,
    });
    return result.data;
  };

export const TOOLS = Object.freeze([
  defineTool({
    name: "bland_status",
    group: "Setup",
    risk: RISK_READ,
    description: "Show Bland connection state: masked key fingerprint, masked number, region, and plan. Never reveals secrets.",
    input: { properties: {}, required: [] },
    handler: async (_input, ctx) => credentialStatus({ env: ctx.env }),
  }),
  defineTool({
    name: "bland_connect_start",
    group: "Setup",
    risk: RISK_WRITE,
    description:
      "Start Bland device authorization to give this agent its own phone number. Returns a verification URL and user code for the OWNER to approve in a browser. Never ask for payment details and never approve the plan yourself.",
    input: {
      properties: {
        clientName: str("Name shown for this agent in Bland (default: my-coding-agent)."),
        prefill: obj("Optional owner prefill: name, first_name, last_name, email, phone."),
      },
      required: [],
    },
    handler: async (input, ctx) =>
      connectStart({
        clientName: input.clientName,
        prefill: input.prefill,
        region: ctx.region,
        fetchImpl: ctx.fetchImpl,
        signal: ctx.signal,
        credentials: { env: ctx.env },
      }),
  }),
  defineTool({
    name: "bland_connect_poll",
    group: "Setup",
    risk: RISK_WRITE,
    description:
      "Poll Bland device authorization once. On owner approval the API key is saved outside the repo; the tool returns only a fingerprint and masked phone number.",
    input: { properties: {}, required: [] },
    handler: async (_input, ctx) =>
      connectPoll({
        region: ctx.region,
        fetchImpl: ctx.fetchImpl,
        signal: ctx.signal,
        credentials: { env: ctx.env },
      }),
  }),
  defineTool({
    name: "bland_disconnect",
    group: "Setup",
    risk: RISK_WRITE,
    description: "Remove locally stored Bland credentials. Also revoke the key in Bland settings if it should no longer work.",
    input: { properties: {}, required: [] },
    handler: (_input, ctx) => disconnect({ env: ctx.env }),
  }),
  defineTool({
    name: "bland_setup_guide",
    group: "Setup",
    risk: RISK_READ,
    description: "Get install/config snippets for OpenCode, Claude Code, and Codex plus the safety rules for phone actions.",
    input: { properties: {}, required: [] },
    handler: async () => SETUP_GUIDE,
  }),

  // Read-only tools -----------------------------------------------------------
  defineTool({ name: "bland_list_agents", group: "Agents", risk: RISK_READ, description: "List Bland agents (v2).", input: { properties: {}, required: [] }, handler: call("GET", "/v2/agents") }),
  defineTool({ name: "bland_get_agent", group: "Agents", risk: RISK_READ, description: "Get one Bland agent by ID.", input: { properties: { agent_id: pathParam("Agent ID.") }, required: ["agent_id"] }, handler: call("GET", "/v2/agents/{agent_id}", ["agent_id"]) }),
  defineTool({ name: "bland_list_agent_versions", group: "Agents", risk: RISK_READ, description: "List saved versions of an agent.", input: { properties: { agent_id: pathParam("Agent ID.") }, required: ["agent_id"] }, handler: call("GET", "/v2/agents/{agent_id}/versions", ["agent_id"]) }),
  defineTool({ name: "bland_get_latest_agent_version", group: "Agents", risk: RISK_READ, description: "Get the newest saved agent version snapshot.", input: { properties: { agent_id: pathParam("Agent ID.") }, required: ["agent_id"] }, handler: call("GET", "/v2/agents/{agent_id}/versions/latest", ["agent_id"]) }),
  defineTool({ name: "bland_list_agent_environments", group: "Agents", risk: RISK_READ, description: "List an agent's dev/staging/production pins.", input: { properties: { agent_id: pathParam("Agent ID.") }, required: ["agent_id"] }, handler: call("GET", "/v2/agents/{agent_id}/environments", ["agent_id"]) }),
  defineTool({ name: "bland_get_agent_number_binding", group: "Agents", risk: RISK_READ, description: "Check which phone numbers route to an agent.", input: { properties: { agent_id: pathParam("Agent ID.") }, required: ["agent_id"] }, handler: call("GET", "/v2/agents/{agent_id}/inbound", ["agent_id"]) }),
  defineTool({ name: "bland_list_calls", group: "Calls", risk: RISK_READ, description: "List call metadata. Optional query filters are passed through.", input: { properties: { query: obj("Bland list-call query filters, e.g. {limit, before, after}.") }, required: [] }, handler: call("GET", "/v1/calls", [], true) }),
  defineTool({ name: "bland_get_call", group: "Calls", risk: RISK_READ, description: "Get call details, metadata, and transcript.", input: { properties: { call_id: pathParam("Call ID.") }, required: ["call_id"] }, handler: call("GET", "/v1/calls/{call_id}", ["call_id"]) }),
  defineTool({ name: "bland_list_active_calls", group: "Calls", risk: RISK_READ, description: "List queued and in-progress calls.", input: { properties: {}, required: [] }, handler: call("GET", "/v1/active") }),
  defineTool({ name: "bland_list_voices", group: "Voices", risk: RISK_READ, description: "List voices available to the account.", input: { properties: {}, required: [] }, handler: call("GET", "/v1/voices") }),
  defineTool({ name: "bland_query_analytics", group: "Analytics", risk: RISK_READ, description: "Query Bland analytics with a request body.", input: { properties: { body: obj("Analytics query body (time range, filters, metrics).") }, required: ["body"] }, handler: call("POST", "/v1/analytics/query") }),
  defineTool({ name: "bland_list_batches", group: "Batches", risk: RISK_READ, description: "List call batches.", input: { properties: {}, required: [] }, handler: call("GET", "/v2/batches") }),
  defineTool({ name: "bland_get_batch", group: "Batches", risk: RISK_READ, description: "Get one batch by ID.", input: { properties: { batch_id: pathParam("Batch ID.") }, required: ["batch_id"] }, handler: call("GET", "/v2/batches/{batch_id}", ["batch_id"]) }),
  defineTool({ name: "bland_get_batch_logs", group: "Batches", risk: RISK_READ, description: "Get logs for a batch.", input: { properties: { batch_id: pathParam("Batch ID.") }, required: ["batch_id"] }, handler: call("GET", "/v2/batches/{batch_id}/logs", ["batch_id"]) }),
  defineTool({ name: "bland_list_sms_numbers", group: "Messaging", risk: RISK_READ, description: "List SMS-enabled numbers.", input: { properties: {}, required: [] }, handler: call("GET", "/v1/sms/numbers") }),
  defineTool({ name: "bland_list_sms_conversations", group: "Messaging", risk: RISK_READ, description: "List SMS conversations.", input: { properties: { query: obj("Optional filters.") }, required: [] }, handler: call("GET", "/v1/sms/conversations", [], true) }),
  defineTool({ name: "bland_get_sms_conversation", group: "Messaging", risk: RISK_READ, description: "Get an SMS conversation by ID.", input: { properties: { conversation_id: pathParam("Conversation ID.") }, required: ["conversation_id"] }, handler: call("GET", "/v1/sms/conversations/{conversation_id}", ["conversation_id"]) }),
  defineTool({ name: "bland_list_phone_numbers", group: "Numbers", risk: RISK_READ, description: "List inbound phone numbers on the account.", input: { properties: {}, required: [] }, handler: call("GET", "/v1/inbound") }),
  defineTool({ name: "bland_get_phone_number", group: "Numbers", risk: RISK_READ, description: "Get settings for an inbound number.", input: { properties: { query: obj("Query with phone_number or number ID as documented by Bland.") }, required: ["query"] }, handler: call("GET", "/v1/inbound-number", [], true) }),
  defineTool({ name: "bland_list_knowledge_bases", group: "Knowledge", risk: RISK_READ, description: "List knowledge base items.", input: { properties: { query: obj("Optional pagination filters.") }, required: [] }, handler: call("GET", "/v1/knowledge", [], true) }),
  defineTool({ name: "bland_get_knowledge_base", group: "Knowledge", risk: RISK_READ, description: "Get one knowledge base item.", input: { properties: { knowledge_id: pathParam("Knowledge item ID.") }, required: ["knowledge_id"] }, handler: call("GET", "/v1/knowledge/{knowledge_id}", ["knowledge_id"]) }),
  defineTool({ name: "bland_list_contacts", group: "Contacts", risk: RISK_READ, description: "List contacts.", input: { properties: { query: obj("Optional filters.") }, required: [] }, handler: call("GET", "/v1/contacts", [], true) }),
  defineTool({ name: "bland_get_contact", group: "Contacts", risk: RISK_READ, description: "Get one contact by ID.", input: { properties: { contact_id: pathParam("Contact ID.") }, required: ["contact_id"] }, handler: call("GET", "/v1/contacts/{contact_id}", ["contact_id"]) }),
  defineTool({ name: "bland_list_tools", group: "Tools", risk: RISK_READ, description: "List Bland in-call tools.", input: { properties: {}, required: [] }, handler: call("GET", "/v2/tools") }),
  defineTool({ name: "bland_list_agent_dispositions", group: "Agents", risk: RISK_READ, description: "List an agent's dispositions.", input: { properties: { agent_id: pathParam("Agent ID.") }, required: ["agent_id"] }, handler: call("GET", "/v2/agents/{agent_id}/dispositions", ["agent_id"]) }),

  // Configuration writes ------------------------------------------------------
  defineTool({ name: "bland_create_agent", group: "Agents", risk: RISK_WRITE, description: "Create an empty Bland agent (draft only; does not publish or route numbers).", input: { properties: { body: obj("Bland create-agent body, e.g. {name, role}.") }, required: ["body"] }, handler: call("POST", "/v2/agents") }),
  defineTool({ name: "bland_save_agent_version", group: "Agents", risk: RISK_WRITE, description: "Save a new agent configuration version. Publishing is a separate confirmed action.", input: { properties: { agent_id: pathParam("Agent ID."), body: obj("Body with snapshot: behavior, settings, contact, optional knowledge.") }, required: ["agent_id", "body"] }, handler: call("POST", "/v2/agents/{agent_id}/versions", ["agent_id"]) }),
  defineTool({ name: "bland_upload_knowledge_text", group: "Knowledge", risk: RISK_WRITE, description: "Add text to a knowledge base (max 1MB).", input: { properties: { body: obj("Body with type:'text', name, text.") }, required: ["body"] }, handler: call("POST", "/v1/knowledgeLearn/text") }),
  defineTool({
    name: "bland_upload_knowledge_file",
    group: "Knowledge",
    risk: RISK_WRITE,
    description: "Upload a base64-encoded file to a knowledge base using multipart/form-data.",
    input: {
      properties: {
        name: str("Knowledge item name."),
        fileBase64: str("Base64-encoded file contents."),
        fileName: str("Filename including extension."),
        contentType: str("MIME type, e.g. text/plain or application/pdf."),
        description: str("Optional description."),
      },
      required: ["name", "fileBase64", "fileName", "contentType"],
    },
    handler: async (input, ctx) => {
      const bytes = Buffer.from(input.fileBase64, "base64");
      const form = new FormData();
      form.set("type", "file");
      form.set("name", input.name);
      if (input.description) form.set("description", input.description);
      form.set("file", new Blob([bytes], { type: input.contentType }), input.fileName);
      const result = await (await ctx.client()).request({
        method: "POST",
        path: "/v1/knowledgeLearn/file",
        formData: form,
        signal: ctx.signal,
      });
      return result.data;
    },
  }),

  // Paid / live actions -------------------------------------------------------
  defineTool({
    name: "bland_send_call",
    group: "Calls",
    risk: RISK_APPROVE,
    description:
      "Place an outbound AI call. Use snake_case Bland v1 /v1/calls fields. Include exactly one route (agent_id + agent_version, persona_id, pathway_id, or task). Verify the destination with the owner before confirming.",
    input: { properties: { body: obj("Bland POST /v1/calls body, e.g. {phone_number, agent_id, agent_version, from}.") }, required: ["body"] },
    handler: call("POST", "/v1/calls"),
  }),
  defineTool({ name: "bland_stop_call", group: "Calls", risk: RISK_APPROVE, description: "End an active call by ID.", input: { properties: { call_id: pathParam("Call ID.") }, required: ["call_id"] }, handler: call("POST", "/v1/calls/{call_id}/stop", ["call_id"]) }),
  defineTool({ name: "bland_send_sms", group: "Messaging", risk: RISK_APPROVE, description: "Send an SMS from an agent number. Requires E.164 user_number and agent_number plus agent_message or objective.", input: { properties: { body: obj("Bland POST /v1/sms/send body.") }, required: ["body"] }, handler: call("POST", "/v1/sms/send") }),
  defineTool({ name: "bland_create_batch", group: "Batches", risk: RISK_APPROVE, description: "Create a batch of calls. Global config must not contain phone_number.", input: { properties: { body: obj("Bland POST /v2/batches body.") }, required: ["body"] }, handler: call("POST", "/v2/batches") }),
  defineTool({ name: "bland_attach_agent_numbers", group: "Agents", risk: RISK_APPROVE, description: "Route inbound phone numbers to an agent. Replaces existing routing for those numbers.", input: { properties: { agent_id: pathParam("Agent ID."), body: obj("Body with phone numbers/environment.") }, required: ["agent_id", "body"] }, handler: call("POST", "/v2/agents/{agent_id}/inbound/attach", ["agent_id"]) }),
  defineTool({ name: "bland_promote_agent", group: "Agents", risk: RISK_APPROVE, description: "Promote a version to production. Live routing change.", input: { properties: { agent_id: pathParam("Agent ID."), body: obj("Body with version_id, bump, optional expected_staging_version_id.") }, required: ["agent_id", "body"] }, handler: call("POST", "/v2/agents/{agent_id}/promote", ["agent_id"]) }),
  defineTool({ name: "bland_purchase_phone_number", group: "Numbers", risk: RISK_APPROVE, description: "Purchase an additional Bland phone number ($15/mo). Owner must explicitly approve the spend.", input: { properties: { body: obj("Body with area_code, country_code, or exact phone_number.") }, required: ["body"] }, handler: call("POST", "/v1/inbound/purchase") }),

  // Escape hatch --------------------------------------------------------------
  defineTool({
    name: "bland_api_request",
    group: "Advanced",
    risk: "dynamic",
    description:
      "Authenticated passthrough to any Bland REST endpoint for full API coverage. Safety tier is derived from method/path; paid, live, and admin calls require confirm:true and explicit owner approval.",
    input: {
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "HTTP method." },
        path: str("API path beginning with /, e.g. /v2/agents/{agent_id}/promote."),
        pathParams: obj("Values for {name} placeholders in path."),
        query: obj("Query string parameters."),
        body: obj("JSON request body."),
      },
      required: ["method", "path"],
    },
    handler: async (input, ctx) => {
      const result = await (await ctx.client()).request({
        method: input.method,
        path: input.path,
        pathParams: input.pathParams,
        query: input.query,
        body: input.body,
        signal: ctx.signal,
      });
      return result.data;
    },
  }),
]);

export const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

/** MCP-facing tool catalogue (MCP uses `inputSchema`, OpenCode uses `input`). */
export function mcpTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input,
    annotations: {
      readOnlyHint: tool.risk === RISK_READ,
      destructiveHint: tool.risk === RISK_ADMIN,
      openWorldHint: true,
    },
  }));
}

export function effectiveRisk(tool, input) {
  if (tool.risk !== "dynamic") return tool.risk;
  return classifyRequest(input?.method, input?.path).risk;
}

/**
 * One execution path for all adapters.
 * `ctx.permission` is an optional host-specific approval hook.
 */
export async function callTool(name, input = {}, context = {}) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new Error(`Unknown Bland tool: ${name}`);
  const env = context.env || process.env;
  const risk = effectiveRisk(tool, input);
  const check = decide(risk, input, context.safetyOptions || { env });

  if (typeof context.permission === "function") {
    await context.permission({
      risk,
      action: permissionAction(risk),
      tool: name,
      input: actionSummary(name, input),
      decision: check,
    });
  }
  assertAllowed(risk, input, context.safetyOptions || { env });

  const ctx = {
    ...context,
    env,
    signal: context.signal,
    credentials: async () => loadCredentials({ env }),
    client: async () => {
      const creds = await loadCredentials({ env });
      return new BlandClient({
        apiKey: creds.apiKey,
        region: context.region || creds.region,
        authScheme: context.authScheme || env.BLAND_AUTH_SCHEME,
        fetchImpl: context.fetchImpl,
        signal: context.signal,
      });
    },
  };
  const data = await tool.handler(input, ctx);
  return { tool: name, risk, data };
}

const SETUP_GUIDE = `# agent-phone-number

Give your coding agent a Bland AI phone number (US/CA calls and SMS) and full Bland REST coverage.

## Safety rules

- The owner signs up and approves the Agent Phone Plan in their own browser. Never ask for payment details or approve the purchase on their behalf.
- API keys, device codes, and verification codes never belong in chat, source files, URLs, or logs.
- Calls, SMS, batches, purchases, routing changes, and admin actions require \`confirm: true\` in the tool call. Keep your host's tool approval prompts on.
- Set \`BLAND_DRY_RUN=1\` to disable every non-read tool. Set \`BLAND_ALLOW_ADMIN=1\` only when the owner explicitly authorized billing/keys/SIP/deletes.
- Bland's Agent Phone Plan limits: 1 concurrent call, 20 calls/hour, 50 calls/day, 20 texts/hour, 100 texts/day, US/CA only.

## OpenCode (V2)

Add to \`opencode.jsonc\`:

\`\`\`jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["agent-phone-number"]
}
\`\`\`

Then run \`bland_status\` in the session. Config changes reload automatically.

## Claude Code

\`\`\`bash
claude plugin marketplace add <owner>/agent-phone-number
claude plugin install agent-phone-number
\`\`\`

Or test locally: \`claude --plugin-dir ./integrations/claude-code\`, then \`/reload-plugins\`.

## Codex

Add to \`~/.codex/config.toml\`:

\`\`\`toml
[mcp_servers.bland]
command = "npx"
args = ["-y", "agent-phone-number-mcp"]
env_vars = ["BLAND_API_KEY", "BLAND_REGION", "BLAND_CREDENTIALS_FILE"]
default_tools_approval_mode = "prompt"

[mcp_servers.bland.tools.bland_send_call]
approval_mode = "approve"

[mcp_servers.bland.tools.bland_api_request]
approval_mode = "approve"
\`\`\`

Run \`codex mcp list\` to verify. Set \`BLAND_DRY_RUN=1\` for a read-only session.

## First run

1. \`bland_status\` — check connection.
2. \`bland_connect_start\` — show the URL and user code to the owner.
3. \`bland_connect_poll\` — once the owner approves, the key is stored outside the repo.
4. \`bland_list_voices\`, \`bland_send_call\` — use the number.

Docs: https://docs.bland.ai/llms.txt
`;
