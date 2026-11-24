import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  classifyRequest,
  redact,
  callTool,
  credentialStatus,
  SafetyError,
  onboardingStatus,
  completeOnboarding,
} from "../src/index.js";

const ACCOUNT_SID = `AC${"a".repeat(32)}`;
const AUTH_TOKEN = "twilio_test_token_1234567890";
const FROM = "+14155550100";
const A = `/2010-04-01/Accounts/${ACCOUNT_SID}`;

function mockFetch(handler) {
  return async (url, init) => {
    const record = { url: String(url), method: init.method, headers: init.headers, body: init.body };
    const response = handler(record);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => JSON.stringify(response.body),
    };
  };
}

function baseEnv(extra = {}) {
  return {
    TWILIO_ACCOUNT_SID: ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: FROM,
    TWILIO_ONBOARDING_COMPLETE: "1",
    TWILIO_CREDENTIALS_FILE: join(tmpdir(), "missing-apn-twilio.json"),
    ...extra,
  };
}

test("classifyRequest applies conservative risk tiers", () => {
  assert.equal(classifyRequest("POST", `${A}/Calls.json`).risk, "approve");
  assert.equal(classifyRequest("GET", `${A}/Calls.json`).risk, "read");
  assert.equal(classifyRequest("POST", `${A}/Messages.json`).risk, "approve");
  assert.equal(classifyRequest("POST", `${A}/IncomingPhoneNumbers.json`).risk, "approve");
  assert.equal(classifyRequest("POST", `${A}/Keys.json`).risk, "admin");
  assert.equal(classifyRequest("DELETE", `${A}/Calls/CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json`).risk, "admin");
  assert.equal(classifyRequest("PATCH", `${A}/IncomingPhoneNumbers/PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json`).risk, "approve");
});

test("redact removes tokens, keys, and auth headers", () => {
  const text = `auth_token: "${AUTH_TOKEN}" authorization: Basic sk_secret12345 ${ACCOUNT_SID}`;
  const output = redact(text);
  assert.ok(!output.includes(AUTH_TOKEN));
  assert.ok(!output.includes("sk_secret12345"));
  assert.ok(!output.includes(ACCOUNT_SID));
});

test("paid calls require explicit confirmation", async () => {
  await assert.rejects(
    () => callTool("twilio_send_call", { to: "+14155550199", message: "hi" }, { env: baseEnv() }),
    (error) => error instanceof SafetyError && /confirm:true/.test(error.message),
  );
});

test("dry run blocks writes but allows reads", async () => {
  const env = baseEnv({ TWILIO_DRY_RUN: "1" });
  const seen = [];
  const fetchImpl = mockFetch((request) => {
    seen.push(request);
    return { status: 200, body: { calls: [] } };
  });
  await assert.rejects(
    () => callTool("twilio_send_sms", { to: "+14155550199", message: "hi", confirm: true }, { env, fetchImpl }),
    /TWILIO_DRY_RUN/,
  );
  const result = await callTool("twilio_list_calls", {}, { env, fetchImpl });
  assert.equal(result.risk, "read");
  assert.equal(seen.length, 1);
});

test("confirmed call sends basic auth, form body, and inline TwiML", async () => {
  let captured;
  const fetchImpl = mockFetch((request) => {
    captured = request;
    return { status: 201, body: { sid: "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status: "queued" } };
  });
  const result = await callTool(
    "twilio_send_call",
    { to: "+14155550199", message: 'Hello <world> & "friend"', confirm: true },
    { env: baseEnv(), fetchImpl },
  );
  assert.equal(result.data.sid, "CAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(captured.method, "POST");
  assert.equal(captured.url, `https://api.twilio.com${A}/Calls.json`);
  assert.equal(
    captured.headers.authorization,
    `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64")}`,
  );
  assert.equal(captured.headers["content-type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(captured.body);
  assert.equal(form.get("To"), "+14155550199");
  assert.equal(form.get("From"), FROM);
  assert.equal(form.get("Twiml"), '<Response><Say>Hello &lt;world&gt; &amp; &quot;friend&quot;</Say></Response>');
});

test("credential status never exposes the secret or full number", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apn-twilio-creds-"));
  const file = join(dir, "twilio-credentials.json");
  await writeFile(file, JSON.stringify({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN, phoneNumber: FROM }));
  const status = await credentialStatus({ env: { TWILIO_CREDENTIALS_FILE: file } });
  assert.equal(status.connected, true);
  assert.equal(JSON.stringify(status).includes(AUTH_TOKEN), false);
  assert.equal(status.phoneNumber, "…0100");
  const stored = await readFile(file, "utf8");
  assert.ok(stored.includes(AUTH_TOKEN));
  await rm(dir, { recursive: true, force: true });
});

test("exactly one voice source is allowed", async () => {
  const fetchImpl = mockFetch(() => ({ status: 201, body: { sid: "CAtest" } }));
  await assert.rejects(
    () =>
      callTool(
        "twilio_send_call",
        { to: "+14155550199", message: "hi", url: "https://example.com/voice.xml", confirm: true },
        { env: baseEnv(), fetchImpl },
      ),
    /exactly one/,
  );
});

test("api passthrough classifies admin paths before sending", async () => {
  const fetchImpl = mockFetch(() => ({ status: 200, body: {} }));
  await assert.rejects(
    () =>
      callTool(
        "twilio_api_request",
        { method: "POST", path: `${A}/Keys.json`, body: { FriendlyName: "x" }, confirm: true },
        { env: baseEnv(), fetchImpl },
      ),
    /TWILIO_ALLOW_ADMIN/,
  );
});

test("live tools are blocked until owner onboarding is complete", async () => {
  const env = baseEnv({ TWILIO_ONBOARDING_COMPLETE: "0" });
  const fetchImpl = mockFetch(() => ({ status: 201, body: { sid: "CAtest" } }));
  await assert.rejects(
    () =>
      callTool(
        "twilio_send_call",
        { to: "+14155550199", message: "hi", confirm: true },
        { env, fetchImpl },
      ),
    /twilio_onboarding_guide/,
  );
});

test("owner attestation completes onboarding and records only last four digits", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apn-onboarding-"));
  const file = join(dir, "twilio-credentials.json");
  await writeFile(file, JSON.stringify({ accountSid: ACCOUNT_SID, authToken: AUTH_TOKEN, phoneNumber: FROM }));
  const env = { TWILIO_CREDENTIALS_FILE: file };

  const before = await onboardingStatus({ env });
  assert.equal(before.complete, false);
  assert.ok(before.next);

  const result = await completeOnboarding({
    verifiedRecipient: "+14155550199",
    acknowledgeTrialLimits: true,
    acknowledgeCosts: true,
    env,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.verifiedRecipient, "…0199");

  const after = await onboardingStatus({ env });
  assert.equal(after.complete, true);
  const stored = await readFile(file, "utf8");
  assert.ok(!stored.includes("+14155550199"));
  assert.ok(stored.includes("0199"));
  await rm(dir, { recursive: true, force: true });
});
