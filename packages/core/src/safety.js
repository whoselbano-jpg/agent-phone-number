import { redact } from "./redact.js";

export const RISK_READ = "read";
export const RISK_WRITE = "write";
export const RISK_APPROVE = "approve";
export const RISK_ADMIN = "admin";

export class SafetyError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = "SafetyError";
    this.detail = detail;
  }
}

export function safetyConfig(options = {}) {
  const env = options.env || process.env;
  return {
    allowAdmin: options.allowAdmin ?? env.BLAND_ALLOW_ADMIN === "1",
    dryRun: options.dryRun ?? env.BLAND_DRY_RUN === "1",
  };
}

/**
 * Central gate used by every adapter. Hosts may add their own approval prompt,
 * but this check is never skipped.
 */
export function decide(risk, input = {}, options = {}) {
  const config = safetyConfig(options);
  const level = RISK_ADMIN === risk ? RISK_ADMIN : [RISK_READ, RISK_WRITE, RISK_APPROVE].includes(risk) ? risk : RISK_APPROVE;

  if (config.dryRun && level !== RISK_READ) {
    return {
      allowed: false,
      level: "dry-run",
      reason: "BLAND_DRY_RUN is enabled; only read-only Bland tools are available.",
      config,
    };
  }
  if (level === RISK_ADMIN && !config.allowAdmin) {
    return {
      allowed: false,
      level: "denied",
      reason:
        "This is an admin-level Bland operation. Set BLAND_ALLOW_ADMIN=1 and pass confirm:true only if the owner explicitly authorized it.",
      config,
    };
  }
  if ((level === RISK_APPROVE || level === RISK_ADMIN) && input?.confirm !== true) {
    return {
      allowed: false,
      level: "confirm",
      reason:
        "This Bland action can spend money, place live traffic, or change live routing. Re-run with confirm:true after owner approval.",
      config,
    };
  }
  return { allowed: true, level, reason: null, config };
}

export function assertAllowed(risk, input, options) {
  const result = decide(risk, input, options);
  if (!result.allowed) throw new SafetyError(result.reason, result);
  return result;
}

/** Permission action name used by OpenCode's ctx.permission.assert. */
export function permissionAction(risk) {
  return `bland:${risk === RISK_READ ? "read" : risk === RISK_WRITE ? "write" : risk === RISK_ADMIN ? "admin" : "approve"}`;
}

/** Redacted description shown in approval prompts and tool results. */
export function actionSummary(name, input = {}) {
  const fields = {};
  for (const key of [
    "to",
    "phone_number",
    "user_number",
    "agent_number",
    "agent_id",
    "call_id",
    "batch_id",
    "path",
    "method",
    "environment",
    "version_id",
  ]) {
    if (input[key] !== undefined) fields[key] = redact(String(input[key]));
  }
  return { tool: name, ...fields };
}
