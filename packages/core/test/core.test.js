import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyRequest, redact, callTool, credentialStatus, SafetyError, connectStart, connectPoll } from "../src/index.js";

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

test("classifyRequest applies conservative risk tiers", () => {
  assert.equal(classifyRequest("POST", "/v1/calls").risk, "approve");
  assert.equal(classifyRequest("GET", "/v2/agents").risk, "read");
  assert.equal(classifyRequest("POST", "/billing/cancel_agent_phone").risk, "admin");
  assert.equal(classifyRequest("DELETE", "/v2/agents/abc").risk, "admin");
  assert.equal(classifyRequest("PATCH", "/v2/agents/abc").risk, "write");
  assert.equal(classifyRequest("POST", "/v1/sms/send").risk, "approve");
});

test("redact removes keys and auth headers", () => {
  const text = 'api_key: "org_abcdefgh1234" authorization: Bearer sk_secret12345';
  const output = redact(text);
  assert.ok(!output.includes("org_abcdefgh1234"));
  assert.ok(!output.includes("sk_secret12345"));
});

test("paid calls require explicit confirmation", async () => {
  const env = { BLAND_API_KEY: "org_testkey123", BLAND_CREDENTIALS_FILE: join(tmpdir(), "missing-apn.json") };
  await assert.rejects(
    () => callTool("bland_send_call", { body: { phone_number: "+14155550100", task: "hi" } }, { env }),
    (error) => error instanceof SafetyError && /confirm:true/.test(error.message),
  );
});

test("dry run blocks writes but allows reads", async () => {
  const env = {
    BLAND_API_KEY: "org_testkey123",
    BLAND_CREDENTIALS_FILE: join(tmpdir(), "missing-apn.json"),
    BLAND_DRY_RUN: "1",
  };
  const seen = [];
  const fetchImpl = mockFetch((request) => {
    seen.push(request);
    return { status: 200, body: { data: [] } };
  });
  await assert.rejects(
    () => callTool("bland_create_agent", { body: { name: "x" }, confirm: true }, { env, fetchImpl }),
    /BLAND_DRY_RUN/,
  );
  const result = await callTool("bland_list_agents", {}, { env, fetchImpl });
  assert.equal(result.risk, "read");
  assert.equal(seen.length, 1);
});

test("confirmed call sends raw authorization header and returns data", async () => {
  const env = { BLAND_API_KEY: "org_testkey123", BLAND_CREDENTIALS_FILE: join(tmpdir(), "missing-apn.json") };
  let captured;
  const fetchImpl = mockFetch((request) => {
    captured = request;
    return { status: 200, body: { call_id: "call-1", status: "success" } };
  });
  const result = await callTool(
    "bland_send_call",
    { body: { phone_number: "+14155550100", task: "Say hello" }, confirm: true },
    { env, fetchImpl },
  );
  assert.equal(result.data.call_id, "call-1");
  assert.equal(captured.headers.authorization, "org_testkey123");
  assert.equal(captured.method, "POST");
  assert.equal(captured.url, "https://api.bland.ai/v1/calls");
});

test("credential status never exposes the key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apn-creds-"));
  const file = join(dir, "credentials.json");
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(file, JSON.stringify({ apiKey: "org_supersecretkey", phoneNumber: "+14155550100" })),
  );
  const status = await credentialStatus({ env: { BLAND_CREDENTIALS_FILE: file } });
  assert.equal(status.connected, true);
  assert.equal(JSON.stringify(status).includes("org_supersecretkey"), false);
  assert.equal(status.phoneNumber, "…0100");
  await rm(dir, { recursive: true, force: true });
});

test("onboarding stores the approved key and returns only a fingerprint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apn-onboard-"));
  const file = join(dir, "credentials.json");
  const env = { BLAND_CREDENTIALS_FILE: file };
  const fetchImpl = mockFetch((request) => {
    if (request.url.endsWith("/start")) {
      return {
        status: 200,
        body: { device_code: "dev_secret", user_code: "ABCD-1234", verification_url_complete: "https://app.bland.ai/verify", expires_in: 900, interval: 5 },
      };
    }
    return {
      status: 200,
      body: { status: "approved", api_key: "org_newsecretkey", org_id: "org-9", phone_number: "+14155550199", plan: "agent-phone-plan" },
    };
  });

  const started = await connectStart({ clientName: "test-agent", fetchImpl, credentials: { env } });
  assert.equal(started.userCode, "ABCD-1234");
  assert.ok(!JSON.stringify(started).includes("dev_secret"));

  const polled = await connectPoll({ fetchImpl, credentials: { env } });
  assert.equal(polled.status, "connected");
  assert.ok(!JSON.stringify(polled).includes("org_newsecretkey"));
  const stored = JSON.parse(await readFile(file, "utf8"));
  assert.equal(stored.apiKey, "org_newsecretkey");
  assert.equal(stored.phoneNumber, "+14155550199");
  await rm(dir, { recursive: true, force: true });
});
