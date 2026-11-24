import { mkdir, readFile, writeFile, unlink, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fingerprint, maskPhone, redact } from "./redact.js";

export const DEFAULT_CREDENTIALS_FILE = join(
  homedir(),
  ".config",
  "agent-phone-number",
  "twilio-credentials.json",
);

export function resolveCredentialsFile(env = process.env) {
  return resolve(env.TWILIO_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_FILE);
}

/**
 * Credentials always come from the environment or a 0600 file outside the repo.
 * Never commit them and never return a raw secret from a tool.
 */
export async function loadCredentials({ env = process.env } = {}) {
  const file = resolveCredentialsFile(env);
  let stored = {};
  try {
    stored = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error(`Could not read credentials file ${file}: ${redact(error.message)}`);
    }
  }

  const envAccountSid = env.TWILIO_ACCOUNT_SID || "";
  const envAuthToken = env.TWILIO_AUTH_TOKEN || "";
  const envApiKey = env.TWILIO_API_KEY || "";
  const envApiSecret = env.TWILIO_API_SECRET || "";
  const useEnvApiKey = Boolean(envApiKey && envApiSecret);

  const accountSid = envAccountSid || stored.accountSid || "";
  const authToken = useEnvApiKey ? "" : envAuthToken || stored.authToken || "";
  const apiKey = useEnvApiKey ? envApiKey : stored.apiKey || "";
  const apiSecret = useEnvApiKey ? envApiSecret : stored.apiSecret || "";
  const username = apiKey || accountSid;
  const password = apiSecret || authToken;
  const authMode = apiKey && apiSecret ? "api-key" : authToken ? "auth-token" : "none";

  return {
    accountSid,
    authToken,
    apiKey,
    apiSecret,
    username,
    password,
    authMode,
    phoneNumber: env.TWILIO_PHONE_NUMBER || stored.phoneNumber || "",
    voiceUrl: env.TWILIO_VOICE_URL || stored.voiceUrl || "",
    onboarding: stored.onboarding || null,
    source: useEnvApiKey || envAuthToken ? "environment" : password ? "file" : "none",
    file,
  };
}

export async function saveCredentials(data, { env = process.env } = {}) {
  const file = resolveCredentialsFile(env);
  const current = await loadCredentials({ env }).catch(() => ({}));
  const next = {
    ...current,
    ...data,
    updatedAt: new Date().toISOString(),
  };
  delete next.source;
  delete next.file;
  delete next.username;
  delete next.password;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600).catch(() => {});
  return file;
}

export async function clearCredentials({ env = process.env } = {}) {
  const file = resolveCredentialsFile(env);
  await unlink(file).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}

/** Safe to show in a chat transcript: no token, key, or full phone number. */
export async function credentialStatus({ env = process.env } = {}) {
  const value = await loadCredentials({ env });
  const secret = value.password;
  return {
    connected: Boolean(value.accountSid && secret),
    source: value.source,
    accountSid: value.accountSid ? maskPhone(value.accountSid) : "none",
    auth: `${value.authMode}:${fingerprint(secret)}`,
    phoneNumber: maskPhone(value.phoneNumber),
    credentialsFile: value.file,
    trialNotice:
      "Twilio trial: 30 days, 75 voice minutes, 100 SMS, 5 verified recipients, sign-up country only, shared trial number. Custom SMS bodies and inline-TwiML calls require an upgraded account.",
    warning:
      value.source === "environment"
        ? "Credentials came from environment variables; they will not persist across processes unless saved to the credentials file."
        : null,
  };
}
