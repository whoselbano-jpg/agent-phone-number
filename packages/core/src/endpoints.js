/**
 * Endpoint metadata used by the generic `twilio_api_request` escape hatch.
 *
 * This registry is a SAFETY CLASSIFIER, not a full Twilio API docs mirror.
 * Paths use the REST version prefix that Twilio returns in resource URIs.
 *
 * risk: read    -> no spend, no live traffic
 *       write   -> creates or edits configuration
 *       approve -> live calls, SMS, number purchases, routing changes
 *       admin   -> deletes, billing, keys, account-level changes
 */
function ep(id, method, path, group, risk, description) {
  return Object.freeze({ id, method: method.toUpperCase(), path, group, risk, description });
}

const A = "/2010-04-01/Accounts/{account_sid}";

export const ENDPOINTS = Object.freeze([
  ep("list_calls", "GET", `${A}/Calls.json`, "Calls", "read", "List calls."),
  ep("create_call", "POST", `${A}/Calls.json`, "Calls", "approve", "Place an outbound call."),
  ep("get_call", "GET", `${A}/Calls/{call_sid}.json`, "Calls", "read", "Get a call."),
  ep("update_call", "POST", `${A}/Calls/{call_sid}.json`, "Calls", "approve", "Cancel, redirect, or end a live call."),
  ep("delete_call", "DELETE", `${A}/Calls/{call_sid}.json`, "Calls", "admin", "Delete a call record."),
  ep("list_call_events", "GET", `${A}/Calls/{call_sid}/Events.json`, "Calls", "read", "List call progress events."),
  ep("list_call_recordings", "GET", `${A}/Calls/{call_sid}/Recordings.json`, "Calls", "read", "List call recordings."),

  ep("list_messages", "GET", `${A}/Messages.json`, "Messaging", "read", "List messages."),
  ep("send_message", "POST", `${A}/Messages.json`, "Messaging", "approve", "Send an SMS."),
  ep("get_message", "GET", `${A}/Messages/{message_sid}.json`, "Messaging", "read", "Get a message."),
  ep("delete_message", "DELETE", `${A}/Messages/{message_sid}.json`, "Messaging", "admin", "Delete a message record."),

  ep("list_numbers", "GET", `${A}/IncomingPhoneNumbers.json`, "Numbers", "read", "List Twilio phone numbers."),
  ep("purchase_number", "POST", `${A}/IncomingPhoneNumbers.json`, "Numbers", "approve", "Buy a phone number."),
  ep("get_number", "GET", `${A}/IncomingPhoneNumbers/{phone_number_sid}.json`, "Numbers", "read", "Get a phone number."),
  ep("configure_number", "POST", `${A}/IncomingPhoneNumbers/{phone_number_sid}.json`, "Numbers", "approve", "Change live voice/SMS routing for a number."),
  ep("release_number", "DELETE", `${A}/IncomingPhoneNumbers/{phone_number_sid}.json`, "Numbers", "admin", "Release a phone number."),
  ep("search_numbers", "GET", `${A}/AvailablePhoneNumbers/{country_code}/{number_type}.json`, "Numbers", "read", "Search available numbers."),

  ep("get_account", "GET", `${A}.json`, "Account", "read", "Get account details."),
  ep("list_usage", "GET", `${A}/Usage/Records.json`, "Billing", "read", "List usage records."),
  ep("list_keys", "GET", `${A}/Keys.json`, "Account", "read", "List API keys."),
  ep("create_key", "POST", `${A}/Keys.json`, "Account", "admin", "Create an API key."),
  ep("delete_key", "DELETE", `${A}/Keys/{key_sid}.json`, "Account", "admin", "Revoke an API key."),
]);

export const ENDPOINT_BY_ID = new Map(ENDPOINTS.map((endpoint) => [endpoint.id, endpoint]));

function toPattern(path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\\\{[^}]+\\\}/g, "[^/]+")}/?$`, "i");
}

const CLASSIFIERS = [
  { re: /\/(Keys|SigningKeys|Billing|Usage\/Records)(?:\/|\.json|$)/i, risk: "admin" },
  { re: /\/Calls\/[^/]+\.json$/i, risk: "approve" },
  { re: /\/Calls\.json$/i, risk: "approve" },
  { re: /\/Messages\.json$/i, risk: "approve" },
  { re: /\/IncomingPhoneNumbers\.json$/i, risk: "approve" },
  { re: /\/IncomingPhoneNumbers\/[^/]+\.json$/i, risk: "approve" },
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
