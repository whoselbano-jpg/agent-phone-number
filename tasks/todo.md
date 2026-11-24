# Tasks: Twilio edition

- [x] Task 1: Replace core client, credentials, redaction, endpoints, and safety policy with Twilio equivalents.
- [x] Task 2: Replace shared tool catalog and tests; keep read/write/approve/admin gates.
- [x] Checkpoint: `node scripts/test.js` 8/8 and `node scripts/lint.js` passed after core.
- [x] Task 3: Update OpenCode plugin, MCP bridge, Claude plugin, and Codex config.
- [x] Task 4: Rewrite README, security notes, publishing notes, env example, and manifests.
- [x] Task 5: Ran final checks, verified stale Bland references are documentation-only, committed, and pushed to `origin/main`.
- [x] Task 6: Added mandatory owner onboarding gate: `twilio_onboarding_guide`, `twilio_onboarding_status`, `twilio_onboarding_complete`, live-tool blocking in shared `callTool`, and `npm run onboarding` interactive checklist.
- [x] Task 7: Ran final tests (10/10), lint (11/11), JSON validation, and adapter doc updates; committed and pushed.
- [x] Task 8: Corrected stale trial claims ($15 credit, dedicated free number) to current 2026 terms: 30 days, 75 voice minutes, 100 SMS, 5 verified recipients, shared number, custom messages require upgrade.

## Notes

- Public repo: https://github.com/whoselbano-jpg/agent-phone-number
- Branch: `main`
- v0.2.0 is a breaking provider change: Bland removed, Twilio added.
