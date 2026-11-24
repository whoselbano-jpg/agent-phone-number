/**
 * Endpoint metadata used by the generic `bland_api_request` escape hatch.
 *
 * This registry is a SAFETY CLASSIFIER, not a substitute for Bland's API docs.
 * Paths marked `verified` were taken from official docs; others are patterns
 * exposed so the classifier can recognize a call. Always check
 * https://docs.bland.ai/llms.txt before using an unfamiliar endpoint.
 *
 * risk: read   -> no spend, no live traffic
 *       write  -> creates or edits configuration/drafts
 *       approve-> live calls, SMS, batches, purchases, routing changes
 *       admin  -> billing, keys, porting, deletes, org changes
 */
function ep(id, method, path, group, risk, description, verified = false) {
  return Object.freeze({ id, method: method.toUpperCase(), path, group, risk, description, verified });
}

export const ENDPOINTS = Object.freeze([
  // Onboarding (unauthenticated)
  ep("onboarding_start", "POST", "/v1/agent/onboarding/start", "Onboarding", "write", "Start device authorization for an agent API key.", true),
  ep("onboarding_poll", "POST", "/v1/agent/onboarding/poll", "Onboarding", "write", "Poll device authorization; approved response contains the API key.", true),
  ep("onboarding_approve", "POST", "/v1/agent/onboarding/approve", "Onboarding", "admin", "Dashboard-only: claim a device code after owner approval.", true),

  // Billing
  ep("cancel_phone_plan", "POST", "/billing/cancel_agent_phone", "Billing", "admin", "Cancel the Agent Phone Plan at period end; no refund.", true),
  ep("cancel_phone_plan_feedback", "POST", "/billing/cancel_agent_phone/feedback", "Billing", "admin", "Submit Agent Phone Plan cancellation feedback.", true),

  // Calls
  ep("send_call", "POST", "/v1/calls", "Calls", "approve", "Place an outbound AI call.", true),
  ep("list_calls", "GET", "/v1/calls", "Calls", "read", "List call metadata.", true),
  ep("get_call", "GET", "/v1/calls/{call_id}", "Calls", "read", "Get call details and transcript.", true),
  ep("list_active_calls", "GET", "/v1/active", "Calls", "read", "List queued and in-progress calls.", true),
  ep("stop_call", "POST", "/v1/calls/{call_id}/stop", "Calls", "approve", "End an active call.", true),
  ep("analyze_call", "POST", "/v1/calls/{call_id}/analyze", "Calls", "approve", "Run AI analysis on a call.", true),
  ep("stop_all_calls", "POST", "/v1/calls-active/stop", "Calls", "admin", "End every active call on the account.", true),
  ep("transfer_call", "POST", "/v1/calls-active/transfer", "Calls", "approve", "Transfer an in-progress call.", true),
  ep("call_event_stream", "GET", "/v1/calls/{call_id}/events", "Calls", "read", "Get the event stream for a call.", false),
  ep("call_recording", "GET", "/v1/calls/{call_id}/recording", "Calls", "read", "Get a call recording stream.", true),

  // Batches
  ep("create_batch", "POST", "/v2/batches", "Batches", "approve", "Create a batch of calls.", true),
  ep("list_batches", "GET", "/v2/batches", "Batches", "read", "List batches."),
  ep("get_batch", "GET", "/v2/batches/{batch_id}", "Batches", "read", "Get one batch."),
  ep("get_batch_logs", "GET", "/v2/batches/{batch_id}/logs", "Batches", "read", "Get batch logs."),
  ep("stop_batch", "POST", "/v2/batches/{batch_id}/stop", "Batches", "approve", "Stop a running batch."),

  // Agents v2
  ep("create_agent", "POST", "/v2/agents", "Agents", "write", "Create an agent with empty environments.", true),
  ep("list_agents", "GET", "/v2/agents", "Agents", "read", "List agents.", true),
  ep("get_agent", "GET", "/v2/agents/{agent_id}", "Agents", "read", "Get an agent.", true),
  ep("update_agent", "PATCH", "/v2/agents/{agent_id}", "Agents", "write", "Rename an agent.", true),
  ep("delete_agent", "DELETE", "/v2/agents/{agent_id}", "Agents", "admin", "Soft-delete an agent.", true),
  ep("create_agent_version", "POST", "/v2/agents/{agent_id}/versions", "Agents", "write", "Save an agent configuration version.", true),
  ep("list_agent_versions", "GET", "/v2/agents/{agent_id}/versions", "Agents", "read", "List agent versions.", true),
  ep("get_latest_agent_version", "GET", "/v2/agents/{agent_id}/versions/latest", "Agents", "read", "Get the newest agent version.", true),
  ep("get_agent_version", "GET", "/v2/agents/{agent_id}/versions/{version_id}", "Agents", "read", "Get an agent version.", true),
  ep("list_agent_environments", "GET", "/v2/agents/{agent_id}/environments", "Agents", "read", "List agent environments and pins.", true),
  ep("list_agent_deployments", "GET", "/v2/agents/{agent_id}/deployments", "Agents", "read", "List deployment history for an environment.", true),
  ep("publish_agent", "POST", "/v2/agents/{agent_id}/publish", "Agents", "approve", "Publish a version to staging.", true),
  ep("promote_agent", "POST", "/v2/agents/{agent_id}/promote", "Agents", "approve", "Pin production to a version.", true),
  ep("rollback_agent", "POST", "/v2/agents/{agent_id}/rollback", "Agents", "approve", "Repoint production at a prior version.", true),
  ep("get_agent_number_binding", "GET", "/v2/agents/{agent_id}/inbound", "Agents", "read", "List numbers attached to an agent.", true),
  ep("attach_agent_numbers", "POST", "/v2/agents/{agent_id}/inbound/attach", "Agents", "approve", "Route inbound numbers to an agent.", true),
  ep("detach_agent_numbers", "POST", "/v2/agents/{agent_id}/inbound/detach", "Agents", "approve", "Stop routing inbound numbers to an agent.", true),
  ep("get_agent_identity", "GET", "/v2/agents/{agent_id}/identity", "Agents", "read", "Get agent contact card.", true),
  ep("update_agent_identity", "PUT", "/v2/agents/{agent_id}/identity", "Agents", "write", "Update agent contact card.", true),
  ep("list_agent_branches", "GET", "/v2/agents/{agent_id}/branches", "Agents", "read", "List agent branches.", true),
  ep("create_agent_branch", "POST", "/v2/agents/{agent_id}/branches", "Agents", "write", "Create an agent branch.", true),
  ep("delete_agent_branch", "DELETE", "/v2/agents/{agent_id}/branches/{branch_id}", "Agents", "admin", "Delete an agent branch.", true),
  ep("list_agent_variables", "GET", "/v2/agents/{agent_id}/environments/{environment}/variables", "Agents", "read", "List environment variables.", true),
  ep("set_agent_variable", "PUT", "/v2/agents/{agent_id}/environments/{environment}/variables/{key}", "Agents", "write", "Set an environment variable.", true),
  ep("delete_agent_variable", "DELETE", "/v2/agents/{agent_id}/environments/{environment}/variables/{key}", "Agents", "admin", "Delete an environment variable.", true),
  ep("list_agent_dispositions", "GET", "/v2/agents/{agent_id}/dispositions", "Agents", "read", "List dispositions.", true),
  ep("create_disposition", "POST", "/v2/agents/{agent_id}/dispositions", "Agents", "write", "Create a disposition draft.", true),
  ep("run_check", "POST", "/v2/agents/{agent_id}/environments/{environment}/check-runs", "Agents", "approve", "Start a check run (may bill the org).", true),
  ep("create_experiment", "POST", "/v2/agents/{agent_id}/experiments", "Agents", "approve", "Start an A/B experiment.", true),

  // Numbers
  ep("list_phone_numbers", "GET", "/v1/inbound", "Numbers", "read", "List inbound phone numbers.", true),
  ep("get_phone_number", "GET", "/v1/inbound-number", "Numbers", "read", "Get inbound number settings.", true),
  ep("purchase_phone_number", "POST", "/v1/inbound/purchase", "Numbers", "approve", "Purchase a phone number ($15/mo).", true),
  ep("update_phone_number", "POST", "/v1/inbound-number/update", "Numbers", "approve", "Update inbound number routing/prompt.", true),
  ep("update_phone_number_label", "POST", "/v1/inbound/update-label", "Numbers", "write", "Update an inbound number label.", true),

  // SMS
  ep("send_sms", "POST", "/v1/sms/send", "Messaging", "approve", "Send an SMS from an agent number.", true),
  ep("send_sms_batch", "POST", "/v1/sms/batch", "Messaging", "approve", "Send a batch of SMS (Enterprise).", true),
  ep("list_sms_numbers", "GET", "/v1/sms/numbers", "Messaging", "read", "List SMS-enabled numbers."),
  ep("list_sms_conversations", "GET", "/v1/sms/conversations", "Messaging", "read", "List SMS conversations."),
  ep("get_sms_conversation", "GET", "/v1/sms/conversations/{conversation_id}", "Messaging", "read", "Get an SMS conversation."),

  // Knowledge
  ep("list_knowledge_bases", "GET", "/v1/knowledge", "Knowledge", "read", "List knowledge base items.", true),
  ep("get_knowledge_base", "GET", "/v1/knowledge/{knowledge_id}", "Knowledge", "read", "Get a knowledge base item.", true),
  ep("upload_knowledge_text", "POST", "/v1/knowledgeLearn/text", "Knowledge", "write", "Add text to a knowledge base.", true),
  ep("upload_knowledge_file", "POST", "/v1/knowledgeLearn/file", "Knowledge", "write", "Upload a file to a knowledge base.", true),
  ep("update_knowledge_base", "PUT", "/v1/knowledge/{knowledge_id}", "Knowledge", "write", "Rename/describe a knowledge item.", true),
  ep("delete_knowledge_base", "DELETE", "/v1/knowledge/{knowledge_id}", "Knowledge", "admin", "Delete a knowledge item.", true),

  // Tools, voices, contacts, analytics
  ep("list_tools", "GET", "/v2/tools", "Tools", "read", "List agent tools."),
  ep("create_tool", "POST", "/v2/tools", "Tools", "write", "Create an agent tool."),
  ep("update_tool", "POST", "/v2/tools/{tool_id}", "Tools", "write", "Update an agent tool."),
  ep("list_tool_logs", "GET", "/v2/tools/logs", "Tools", "read", "List tool call logs."),
  ep("list_voices", "GET", "/v1/voices", "Voices", "read", "List available voices.", true),
  ep("list_contacts", "GET", "/v1/contacts", "Contacts", "read", "List contacts."),
  ep("get_contact", "GET", "/v1/contacts/{contact_id}", "Contacts", "read", "Get a contact."),
  ep("resolve_contact", "POST", "/v1/contacts/resolve", "Contacts", "write", "Resolve a contact by phone/email."),
  ep("merge_contacts", "POST", "/v1/contacts/merge", "Contacts", "admin", "Merge contacts."),
  ep("query_analytics", "POST", "/v1/analytics/query", "Analytics", "read", "Query analytics."),

  // Account / keys / SIP are admin-only in this plugin.
  ep("create_api_key", "POST", "/v1/keys/create", "Account", "admin", "Create an API key (requires full-access key).", true),
  ep("list_sip_config", "GET", "/v1/sip/config", "SIP", "read", "List SIP configuration."),
  ep("attach_sip", "POST", "/v1/sip/attach", "SIP", "admin", "Attach SIP trunk configuration."),
  ep("cancel_port", "DELETE", "/v1/sip/port/cancel", "SIP", "admin", "Cancel a number port request."),
]);

export const ENDPOINT_BY_ID = new Map(ENDPOINTS.map((endpoint) => [endpoint.id, endpoint]));

function toPattern(path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[^}]+\\\}/g, "[^/]+")}/?$`, "i");
}

const CLASSIFIERS = [
  { re: /^\/billing\//i, risk: "admin" },
  { re: /^\/v1\/keys\//i, risk: "admin" },
  { re: /^\/v1\/sip\//i, risk: "admin" },
  { re: /\/onboarding\/approve$/i, risk: "admin" },
  { re: /\/agent-onboarding\/approve$/i, risk: "admin" },
  { re: /\/(delete|cancel|merge|stop-all)/i, risk: "admin" },
  { re: /^\/v1\/calls($|\/)/i, risk: "approve" },
  { re: /^\/v1\/sms\//i, risk: "approve" },
  { re: /^\/v2\/batches/i, risk: "approve" },
  { re: /^\/v1\/inbound\/purchase$/i, risk: "approve" },
];

/** Classify an arbitrary REST call made through the generic escape hatch. */
export function classifyRequest(method, path) {
  const verb = String(method || "GET").toUpperCase();
  const clean = String(path || "/").split("?")[0];
  const exact = ENDPOINTS.find(
    (endpoint) => endpoint.method === verb && endpoint.path.toLowerCase() === clean.toLowerCase(),
  );
  if (exact) return { risk: exact.risk, endpoint: exact };

  const templated = ENDPOINTS.find(
    (endpoint) => endpoint.method === verb && toPattern(endpoint.path).test(clean),
  );
  if (templated) return { risk: templated.risk, endpoint: templated };

  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") {
    return { risk: "read", endpoint: null };
  }
  if (verb === "DELETE") return { risk: "admin", endpoint: null };
  for (const rule of CLASSIFIERS) {
    if (rule.re.test(clean)) return { risk: rule.risk, endpoint: null };
  }
  return { risk: verb === "POST" || verb === "PUT" || verb === "PATCH" ? "write" : "admin", endpoint: null };
}
