import { unauthenticatedRequest } from "./client.js";
import { saveCredentials, clearCredentials, loadCredentials } from "./credentials.js";
import { fingerprint, maskPhone, redact } from "./redact.js";

const START = "/v1/agent/onboarding/start";
const POLL = "/v1/agent/onboarding/poll";

/**
 * Step 1 of Bland's device-authorization flow. No key needed.
 * Show `verification_url_complete` and `user_code` to the owner; never log device_code.
 */
export async function connectStart({
  clientName = process.env.BLAND_CLIENT_NAME || "my-coding-agent",
  prefill = {},
  region,
  fetchImpl,
  signal,
  credentials,
} = {}) {
  const result = await unauthenticatedRequest({
    path: START,
    body: { client_name: clientName, ...(Object.keys(prefill).length ? { prefill } : {}) },
    region,
    fetchImpl,
    signal,
  });
  if (!result?.device_code || !result?.user_code) {
    throw new Error(`Unexpected onboarding start response: ${redact(JSON.stringify(result))}`);
  }
  await saveCredentials({
    pendingDeviceCode: result.device_code,
    pendingExpiresAt: new Date(Date.now() + Number(result.expires_in || 900) * 1000).toISOString(),
    clientName,
    region: region || "us",
  }, credentials);
  return {
    status: "awaiting_owner",
    verificationUrl: result.verification_url_complete || result.verification_url,
    userCode: result.user_code,
    expiresIn: result.expires_in,
    pollInterval: result.interval || 5,
    message:
      "Ask the owner to open the URL, sign in / subscribe to the Agent Phone Plan, and approve this code. Do not ask for payment details and do not approve on their behalf.",
  };
}

/**
 * Step 2. Polls once per call (the MCP/OpenCode tools should not loop).
 * On approval the key goes straight to the credentials file and is never returned.
 */
export async function connectPoll({ region, fetchImpl, signal, credentials } = {}) {
  const current = await loadCredentials(credentials);
  const deviceCode = current.pendingDeviceCode;
  if (!deviceCode) {
    throw new Error("No pending onboarding. Run connect_start first.");
  }
  let result;
  try {
    result = await unauthenticatedRequest({
      path: POLL,
      body: { device_code: deviceCode },
      region,
      fetchImpl,
      signal,
    });
  } catch (error) {
    if (error.status === 429) {
      return {
        status: "pending",
        retryAfter: Number(error.body?.interval || error.body?.error?.interval || 5),
        message: "Too fast; wait before polling again.",
      };
    }
    throw error;
  }

  const status = String(result?.status || "pending").toLowerCase();
  if (status === "pending" || status === "authorization_pending") {
    return { status: "pending", message: "Owner has not approved yet." };
  }
  if (status === "expired" || status === "code_expired") {
    await saveCredentials({ pendingDeviceCode: null, pendingExpiresAt: null }, credentials);
    return { status: "expired", message: "Code expired. Run connect_start again." };
  }
  if (status !== "approved") {
    return { status, message: `Unhandled onboarding status: ${redact(status)}` };
  }
  if (!result.api_key) throw new Error("Approval response did not include an API key.");

  await saveCredentials(
    {
      apiKey: result.api_key,
      orgId: result.org_id || "",
      phoneNumber: result.phone_number || "",
      plan: result.plan || "agent-phone-plan",
      clientName: result.client_name || current.clientName || "",
      pendingDeviceCode: null,
      pendingExpiresAt: null,
      region: region || current.region || "us",
    },
    credentials,
  );
  return {
    status: "connected",
    key: fingerprint(result.api_key),
    orgId: maskPhone(result.org_id),
    phoneNumber: maskPhone(result.phone_number),
    plan: result.plan || "agent-phone-plan",
    message: "Connected. The API key was stored outside the repository and will not be shown again.",
  };
}

export async function disconnect(credentials) {
  await clearCredentials(credentials);
  return { status: "disconnected", message: "Local Bland credentials removed. Revoke the key in Bland settings if needed." };
}
