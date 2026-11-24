# Security notes

## Secrets

- Credentials come from `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`, or `TWILIO_API_KEY` + `TWILIO_API_SECRET`, or a `0600` file at `~/.config/agent-phone-number/twilio-credentials.json`.
- There is no "paste your key into chat" onboarding. The owner configures credentials in their own shell or file.
- `redact()` removes auth tokens, API keys, API secrets, authorization headers, and Twilio SIDs from error messages and tool output.
- Never place credentials, verification codes, or live phone numbers in chat, URLs, issue reports, logs, or source control.

## Approval policy

`packages/core/src/safety.js` is the single enforcement point:

- `read` — allowed.
- `write` — host approval prompt where supported.
- `approve` — blocked unless `confirm: true` and host approval.
- `admin` — blocked entirely unless `TWILIO_ALLOW_ADMIN=1`, then same as `approve`.
- `TWILIO_DRY_RUN=1` — blocks everything except `read`.

OpenCode uses `ctx.permission.assert` so existing permission rules (including saved approvals and denies) apply. Claude Code and Codex keep their own MCP approval prompts on in the shipped configs. `twilio_api_request` is classified from method/path, with conservative defaults for unknown endpoints.

## Calling and texting

- The owner must create the Twilio account and verify recipient numbers in the Twilio Console. The agent must not ask for verification codes or bypass trial restrictions.
- Verify the destination number with the owner before `confirm: true`.
- Use exactly one voice source in `twilio_send_call`: plain `message` (escaped into inline TwiML), raw `twiml`, or a trusted `url`.
- After a call, record the returned call SID and use `twilio_get_call` to verify what happened. Do not duplicate a call without checking the first one.
- Trial credit is real money. Keep `TWILIO_DRY_RUN=1` while exploring.

## Reporting a vulnerability

Open an issue with a redacted description and reproduction steps. Do not include live credentials, phone numbers, verification codes, or webhook secrets.
