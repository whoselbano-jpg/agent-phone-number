import { TwilioClient } from "./client.js";
import { classifyRequest } from "./endpoints.js";
import { loadCredentials, credentialStatus, clearCredentials } from "./credentials.js";
import { decide, assertAllowed, permissionAction, actionSummary, RISK_READ, RISK_WRITE, RISK_APPROVE, RISK_ADMIN } from "./safety.js";

const str = (description) => ({ type: "string", description });
const bool = (description) => ({ type: "boolean", description });
const num = (description) => ({ type: "integer", description });
const obj = (description = "Object") => ({ type: "object", description, additionalProperties: true });
const pathParam = (description) => str(description);

const A = "/2010-04-01/Accounts/{account_sid}";

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

/** Build a handler that forwards to a documented Twilio REST path. */
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

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function requireE164(value, label = "to") {
  const normalized = String(value || "").trim();
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error(`${label} must be an E.164 number such as +14155550100.`);
  }
  return normalized;
}

function callBody(input, credentials) {
  const from = input.from || credentials.phoneNumber;
  if (!from) throw new Error("No From number configured. Set TWILIO_PHONE_NUMBER or pass from explicitly.");
  const sources = [input.message, input.twiml, input.url].filter((value) => Boolean(value));
  if (sources.length !== 1) {
    throw new Error("Provide exactly one of message, twiml, or url.");
  }
  const body = { To: requireE164(input.to), From: from };
  if (input.url) {
    body.Url = input.url;
    if (input.method) body.Method = input.method;
  } else if (input.twiml) {
    if (input.twiml.length > 4000) throw new Error("Twiml must be 4000 characters or fewer.");
    body.Twiml = input.twiml;
  } else {
    const twiml = `<Response><Say>${escapeXml(input.message)}</Say></Response>`;
    if (twiml.length > 4000) throw new Error("Message is too long for inline TwiML (4000 characters max).");
    body.Twiml = twiml;
  }
  if (input.record !== undefined) body.Record = Boolean(input.record);
  if (input.timeout !== undefined) body.Timeout = input.timeout;
  if (input.statusCallback) body.StatusCallback = input.statusCallback;
  return body;
}

function smsBody(input, credentials) {
  const from = input.from || credentials.phoneNumber;
  if (!from) throw new Error("No From number configured. Set TWILIO_PHONE_NUMBER or pass from explicitly.");
  const message = String(input.message || "").trim();
  if (!message) throw new Error("message is required.");
  if (message.length > 1600) throw new Error("message must be 1600 characters or fewer.");
  const body = { To: requireE164(input.to), From: from, Body: message };
  if (input.statusCallback) body.StatusCallback = input.statusCallback;
  return body;
}

export const TOOLS = Object.freeze([
  defineTool({
    name: "twilio_status",
    group: "Setup",
    risk: RISK_READ,
    description: "Show Twilio connection state: masked Account SID, masked number, auth fingerprint, and trial notice. Never reveals secrets.",
    input: { properties: {}, required: [] },
    handler: async (_input, ctx) => credentialStatus({ env: ctx.env }),
  }),
  defineTool({
    name: "twilio_setup_guide",
    group: "Setup",
    risk: RISK_READ,
    description: "Get install/config snippets for OpenCode, Claude Code, and Codex plus the safety rules for phone actions.",
    input: { properties: {}, required: [] },
    handler: async () => SETUP_GUIDE,
  }),
  defineTool({
    name: "twilio_disconnect",
    group: "Setup",
    risk: RISK_WRITE,
    description: "Remove locally stored Twilio credentials. Revoke the key or auth token in the Twilio Console if it should no longer work.",
    input: { properties: {}, required: [] },
    handler: async (_input, ctx) => {
      await clearCredentials({ env: ctx.env });
      return { status: "disconnected", message: "Local Twilio credentials removed." };
    },
  }),

  // Read-only tools -----------------------------------------------------------
  defineTool({ name: "twilio_list_phone_numbers", group: "Numbers", risk: RISK_READ, description: "List Twilio phone numbers on the account.", input: { properties: { query: obj("Optional Twilio filters, e.g. {PageSize, PhoneNumber}.") }, required: [] }, handler: call("GET", `${A}/IncomingPhoneNumbers.json`, [], true) }),
  defineTool({ name: "twilio_get_phone_number", group: "Numbers", risk: RISK_READ, description: "Get one Twilio phone number by SID.", input: { properties: { phone_number_sid: pathParam("Phone number SID (PN…).") }, required: ["phone_number_sid"] }, handler: call("GET", `${A}/IncomingPhoneNumbers/{phone_number_sid}.json`, ["phone_number_sid"]) }),
  defineTool({ name: "twilio_search_numbers", group: "Numbers", risk: RISK_READ, description: "Search available Twilio numbers before buying one.", input: { properties: { country_code: str("Country code, default US."), number_type: str("local, mobile, or toll-free; default local."), query: obj("Filters such as {AreaCode, Contains, Limit}.") }, required: [] }, handler: async (input, ctx) => call("GET", `${A}/AvailablePhoneNumbers/{country_code}/{number_type}.json`, ["country_code", "number_type"], true)({ ...input, country_code: input.country_code || "US", number_type: input.number_type || "local" }, ctx) }),
  defineTool({ name: "twilio_list_calls", group: "Calls", risk: RISK_READ, description: "List call metadata. Optional Twilio query filters are passed through.", input: { properties: { query: obj("Twilio list-call filters, e.g. {To, From, Status, PageSize}.") }, required: [] }, handler: call("GET", `${A}/Calls.json`, [], true) }),
  defineTool({ name: "twilio_get_call", group: "Calls", risk: RISK_READ, description: "Get call details, status, price, and duration.", input: { properties: { call_sid: pathParam("Call SID (CA…).") }, required: ["call_sid"] }, handler: call("GET", `${A}/Calls/{call_sid}.json`, ["call_sid"]) }),
  defineTool({ name: "twilio_list_call_events", group: "Calls", risk: RISK_READ, description: "List progress events for a call.", input: { properties: { call_sid: pathParam("Call SID (CA…).") }, required: ["call_sid"] }, handler: call("GET", `${A}/Calls/{call_sid}/Events.json`, ["call_sid"]) }),
  defineTool({ name: "twilio_list_messages", group: "Messaging", risk: RISK_READ, description: "List messages. Optional Twilio query filters are passed through.", input: { properties: { query: obj("Filters such as {To, From, DateSent, PageSize}.") }, required: [] }, handler: call("GET", `${A}/Messages.json`, [], true) }),
  defineTool({ name: "twilio_get_message", group: "Messaging", risk: RISK_READ, description: "Get one message by SID.", input: { properties: { message_sid: pathParam("Message SID (SM…).") }, required: ["message_sid"] }, handler: call("GET", `${A}/Messages/{message_sid}.json`, ["message_sid"]) }),
  defineTool({ name: "twilio_get_usage", group: "Billing", risk: RISK_READ, description: "List account usage records.", input: { properties: { query: obj("Twilio usage filters, e.g. {Category, StartDate, EndDate}.") }, required: [] }, handler: call("GET", `${A}/Usage/Records.json`, [], true) }),

  // Live / paid actions -------------------------------------------------------
  defineTool({
    name: "twilio_send_call",
    group: "Calls",
    risk: RISK_APPROVE,
    description:
      "Place an outbound one-way voice call. Provide a plain message (spoken with Twilio text-to-speech), raw twiml, or a URL. Verify the destination with the owner before confirming.",
    input: {
      properties: {
        to: str("Destination in E.164 format, e.g. +14155550100."),
        message: str("Plain text for Twilio to speak. Escaped into inline TwiML; no webhook needed."),
        twiml: str("Optional raw TwiML instead of message (4000 chars max)."),
        url: str("Optional HTTPS URL returning TwiML instead of message/twiml."),
        from: str("Optional caller ID; defaults to TWILIO_PHONE_NUMBER."),
        method: { type: "string", enum: ["GET", "POST"], description: "Method Twilio uses to fetch url." },
        record: bool("Record the call. Off by default."),
        timeout: num("Seconds to let the phone ring."),
        statusCallback: str("Optional status callback URL."),
      },
      required: ["to"],
    },
    handler: async (input, ctx) => {
      const credentials = await ctx.credentials();
      const result = await (await ctx.client()).request({
        method: "POST",
        path: `${A}/Calls.json`,
        body: callBody(input, credentials),
        signal: ctx.signal,
      });
      return result.data;
    },
  }),
  defineTool({
    name: "twilio_cancel_call",
    group: "Calls",
    risk: RISK_APPROVE,
    description: "Cancel or end an in-progress call by SID.",
    input: { properties: { call_sid: pathParam("Call SID (CA…)."), status: { type: "string", enum: ["canceled", "completed"], description: "Desired status; default canceled." } }, required: ["call_sid"] },
    handler: async (input, ctx) => {
      const result = await (await ctx.client()).request({
        method: "POST",
        path: `${A}/Calls/{call_sid}.json`,
        pathParams: { call_sid: input.call_sid },
        body: { Status: input.status || "canceled" },
        signal: ctx.signal,
      });
      return result.data;
    },
  }),
  defineTool({
    name: "twilio_send_sms",
    group: "Messaging",
    risk: RISK_APPROVE,
    description: "Send an SMS from a Twilio number. Trial accounts can text only verified recipient numbers.",
    input: {
      properties: {
        to: str("Destination in E.164 format."),
        message: str("SMS body (1600 chars max)."),
        from: str("Optional sender; defaults to TWILIO_PHONE_NUMBER."),
        statusCallback: str("Optional status callback URL."),
      },
      required: ["to", "message"],
    },
    handler: async (input, ctx) => {
      const credentials = await ctx.credentials();
      const result = await (await ctx.client()).request({
        method: "POST",
        path: `${A}/Messages.json`,
        body: smsBody(input, credentials),
        signal: ctx.signal,
      });
      return result.data;
    },
  }),
  defineTool({
    name: "twilio_configure_number",
    group: "Numbers",
    risk: RISK_APPROVE,
    description: "Change live voice/SMS webhook routing on a Twilio number. Requires owner approval.",
    input: { properties: { phone_number_sid: pathParam("Phone number SID (PN…)."), body: obj("Twilio IncomingPhoneNumber update fields, e.g. {VoiceUrl, SmsUrl, FriendlyName}.") }, required: ["phone_number_sid", "body"] },
    handler: call("POST", `${A}/IncomingPhoneNumbers/{phone_number_sid}.json`, ["phone_number_sid"]),
  }),
  defineTool({
    name: "twilio_purchase_number",
    group: "Numbers",
    risk: RISK_APPROVE,
    description: "Buy a Twilio phone number. This may spend account credit and requires explicit owner approval.",
    input: {
      properties: {
        phone_number: str("Exact number to buy (E.164), or use area_code."),
        area_code: str("Three-digit area code to search."),
        country_code: str("Country for area-code search; default US."),
        number_type: str("local, mobile, or toll-free; default local."),
        friendly_name: str("Optional label."),
        voice_url: str("Optional HTTPS webhook for inbound calls."),
        sms_url: str("Optional HTTPS webhook for inbound SMS."),
      },
      required: [],
    },
    handler: async (input, ctx) => {
      if (!input.phone_number && !input.area_code) {
        throw new Error("Provide phone_number or area_code.");
      }
      const body = {};
      if (input.phone_number) body.PhoneNumber = requireE164(input.phone_number, "phone_number");
      if (input.area_code) body.AreaCode = String(input.area_code).replace(/\D/g, "");
      if (input.friendly_name) body.FriendlyName = input.friendly_name;
      if (input.voice_url) body.VoiceUrl = input.voice_url;
      if (input.sms_url) body.SmsUrl = input.sms_url;
      const result = await (await ctx.client()).request({
        method: "POST",
        path: `${A}/IncomingPhoneNumbers.json`,
        body,
        signal: ctx.signal,
      });
      return result.data;
    },
  }),

  // Escape hatch --------------------------------------------------------------
  defineTool({
    name: "twilio_api_request",
    group: "Advanced",
    risk: "dynamic",
    description:
      "Authenticated passthrough to any Twilio REST endpoint for full API coverage. Safety tier is derived from method/path; paid, live, and admin calls require confirm:true and explicit owner approval.",
    input: {
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "HTTP method." },
        path: str("API path beginning with /, e.g. /2010-04-01/Accounts/{account_sid}/Calls.json."),
        pathParams: obj("Values for {name} placeholders in path."),
        query: obj("Query string parameters."),
        body: obj("Form-encoded request fields."),
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
  if (!tool) throw new Error(`Unknown Twilio tool: ${name}`);
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
      return new TwilioClient({
        accountSid: creds.accountSid,
        username: creds.username,
        password: creds.password,
        fetchImpl: context.fetchImpl,
      });
    },
  };
  const data = await tool.handler(input, ctx);
  return { tool: name, risk, data };
}

const SETUP_GUIDE = `# agent-phone-number (Twilio edition)

Give your coding agent a Twilio trial number and Twilio REST tools across OpenCode, Claude Code, and Codex.

## Safety rules

- The owner creates the Twilio account and verifies the recipient number in the Twilio Console. Never ask for credentials, card details, or verification codes in chat.
- Twilio trial accounts get a free number and $15 credit, but can call/text only **verified numbers**. Never bypass that restriction.
- Calls, SMS, number purchases, and routing changes require \`confirm: true\` in the tool call. Keep your host's approval prompts on.
- Set \`TWILIO_DRY_RUN=1\` to disable every non-read tool. Set \`TWILIO_ALLOW_ADMIN=1\` only when the owner explicitly authorized key/delete/admin operations.
- Verify the destination with the owner before every live action. Use \`twilio_get_call\` afterward to confirm what happened.

## Credentials

Set these in your shell (never in the repo or chat):

\`\`\`bash
export TWILIO_ACCOUNT_SID=AC...
export TWILIO_AUTH_TOKEN=...
export TWILIO_PHONE_NUMBER=+1...
\`\`\`

Or use an API key: \`TWILIO_API_KEY\` + \`TWILIO_API_SECRET\`. To persist outside the repo, write \`~/.config/agent-phone-number/twilio-credentials.json\` with mode 0600.

## OpenCode (V2)

Add to \`opencode.jsonc\`:

\`\`\`jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["agent-phone-number"]
}
\`\`\`

Then run \`twilio_status\` in the session. Tools appear under the \`twilio\` namespace.

## Claude Code

\`\`\`bash
claude plugin marketplace add whoselbano-jpg/agent-phone-number
claude plugin install agent-phone-number
\`\`\`

Or test locally: \`claude --plugin-dir ./integrations/claude-code\`, then \`/reload-plugins\`.

## Codex

Add to \`~/.codex/config.toml\`:

\`\`\`toml
[mcp_servers.twilio]
command = "npx"
args = ["-y", "agent-phone-number-mcp"]
env_vars = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_CREDENTIALS_FILE"]
default_tools_approval_mode = "prompt"

[mcp_servers.twilio.tools.twilio_send_call]
approval_mode = "approve"

[mcp_servers.twilio.tools.twilio_send_sms]
approval_mode = "approve"

[mcp_servers.twilio.tools.twilio_purchase_number]
approval_mode = "approve"

[mcp_servers.twilio.tools.twilio_api_request]
approval_mode = "approve"
\`\`\`

Run \`codex mcp list\` to verify. Set \`TWILIO_DRY_RUN=1\` for a read-only session.

## First run

1. \`twilio_status\` — check credentials and number.
2. \`twilio_list_phone_numbers\` — confirm the caller ID.
3. \`twilio_send_call\` with \`to\` and \`message\` — one-way call with spoken text, no webhook needed.
4. \`twilio_get_call\` — verify status and duration.

Docs: https://www.twilio.com/docs/voice/api/call-resource
`;
