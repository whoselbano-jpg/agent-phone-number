import { mkdir, readFile, writeFile, unlink, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fingerprint, maskPhone, redact } from "./redact.js";

export const DEFAULT_CREDENTIALS_FILE = join(
  homedir(),
  ".config",
  "agent-phone-number",
  "credentials.json",
);

export function resolveCredentialsFile(env = process.env) {
  return resolve(env.BLAND_CREDENTIALS_FILE || DEFAULT_CREDENTIALS_FILE);
}

/**
 * Credentials always come from the environment or a 0600 file outside the repo.
 * Never commit them and never return the raw key from a tool.
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
  const apiKey = env.BLAND_API_KEY || stored.apiKey || "";
  return {
    apiKey,
    orgId: stored.orgId || "",
    phoneNumber: stored.phoneNumber || "",
    plan: stored.plan || "",
    clientName: stored.clientName || "",
    pendingDeviceCode: stored.pendingDeviceCode || "",
    pendingExpiresAt: stored.pendingExpiresAt || "",
    region: env.BLAND_REGION || stored.region || "us",
    source: env.BLAND_API_KEY ? "environment" : apiKey ? "file" : "none",
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

/** Safe to show in a chat transcript: no key, device code, or raw phone number. */
export async function credentialStatus({ env = process.env } = {}) {
  const value = await loadCredentials({ env });
  return {
    connected: Boolean(value.apiKey),
    source: value.source,
    key: fingerprint(value.apiKey),
    orgId: value.orgId ? maskPhone(value.orgId) : "none",
    phoneNumber: maskPhone(value.phoneNumber),
    region: value.region,
    plan: value.plan || "unknown",
    clientName: value.clientName || "unknown",
    credentialsFile: value.file,
    warning:
      value.source === "environment"
        ? "Key came from BLAND_API_KEY; onboarding changes will not persist across processes unless saved to the credentials file."
        : null,
  };
}
