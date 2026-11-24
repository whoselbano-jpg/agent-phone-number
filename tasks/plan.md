# Implementation Plan: Replace Bland with Twilio trial voice/SMS

Source decision: user asked to remove Bland; free SIP DIDs were discontinued at the main providers in 2026, so Twilio's free trial (free number + $15 credit, verified-number calling) is the practical free path.

## Overview
Rewrite the shared core and all three adapters from `bland_*` to `twilio_*`, keeping the owner-approval safety tiers. v2 focuses on outbound one-way voice calls using Twilio's inline `Twiml` parameter (no webhook required), SMS, number/call/message reads, paid number purchase, and full REST passthrough.

## Architecture decisions
- Keep monorepo and package names; only the provider and tool namespace change.
- Credentials come from `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (or API key/secret) or a 0600 file outside the repo; never from chat.
- `twilio_send_call` builds `<Response><Say>...</Say></Response>` from a plain `message`, making one-way calls work with zero hosting.
- Twilio POST bodies are form-encoded; responses are JSON.
- `twilio_api_request` keeps full REST coverage with risk derived from method/path.
- Live tools are gated by `assertOnboardingComplete` in shared `callTool`; the owner attestation stores only last-four-digit/cost/trial markers in the 0600 credentials file. `TWILIO_ONBOARDING_COMPLETE=1` is CI/test-only.

## Task list
1. Replace core client, credentials, redaction, endpoints, and safety policy with Twilio equivalents.
2. Replace shared tool catalog and tests; keep read/write/approve/admin gates.
3. Update OpenCode plugin, MCP bridge, Claude plugin, and Codex config.
4. Rewrite README, security notes, publishing notes, env example, and CI/manifests.
5. Run tests/lint, verify JSON/TOML, commit, push if credentials are available.
6. Add a mandatory owner onboarding gate so agents prompt for the Twilio account/number/verification/credential steps and cannot use live tools until the owner attests.

## Checkpoints
- After task 2: `node scripts/test.js` and `node scripts/lint.js` pass.
- After task 4: no `bland` references remain except intentional history/docs notes.
- After task 5: clean working tree and remote updated.

## Risks
| Risk | Mitigation |
| --- | --- |
| Trial can only call verified numbers | State clearly in setup guide and status output. |
| Paid actions spend real money | `confirm: true` plus host approval; dry-run mode. |
| Inline TwiML has 4000-char limit | Validate/truncate with clear error before request. |
| No token available for push after cleanup | Commit locally and ask user to re-add token if needed. |
