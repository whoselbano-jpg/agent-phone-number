# Security notes

## Secrets

- The preferred credential source is the device onboarding flow: `bland_connect_start` → owner approval in a browser → `bland_connect_poll`. The approved key is written directly to `~/.config/agent-phone-number/credentials.json` with mode `0600` and is never returned to the model.
- `BLAND_API_KEY` is supported for existing keys. It is read from the environment, never from a repo file.
- `redact()` removes API keys, `authorization` headers, device codes, and verification codes from error messages and tool output.
- Never place keys or codes in chat, URLs, issue reports, logs, or source control.

## Approval policy

`packages/core/src/safety.js` is the single enforcement point:

- `read` — allowed.
- `write` — host approval prompt where supported.
- `approve` — blocked unless `confirm: true` and host approval.
- `admin` — blocked entirely unless `BLAND_ALLOW_ADMIN=1`, then same as `approve`.
- `BLAND_DRY_RUN=1` — blocks everything except `read`.

OpenCode uses `ctx.permission.assert` so existing permission rules (including saved approvals and denies) apply. Claude Code and Codex keep their own MCP approval prompts on in the shipped configs. `bland_api_request` is always treated as at least `approve`, and admin paths are recognized from method/path patterns.

## Buying and dialing

- Only the **owner** may approve signup and the Agent Phone Plan. Never ask for payment details, never approve on their behalf, and never relay a shared payment token through the agent.
- Verify the destination number and the agent/version with the owner before `confirm: true`.
- After a call, record the returned `call_id` and use `bland_get_call` to verify what happened. Do not duplicate a call without checking the first one.
- The Agent Phone Plan is US/CA only and rate limited (1 concurrent call, 20/hour, 50/day). Respect these limits.

## Reporting a vulnerability

Open an issue with a redacted description and reproduction steps. Do not include live keys, phone numbers, device codes, or webhook secrets.
