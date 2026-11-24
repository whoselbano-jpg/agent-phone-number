---
name: twilio-phone
description: Give Claude Code a Twilio phone number, then place one-way voice calls or send SMS with owner-approval guardrails. Use when the user asks for an AI phone number, an agent phone line, or to call/text via Twilio.
---

# Twilio phone tools

The `twilio` MCP server exposes `twilio_status`, `twilio_setup_guide`, onboarding tools, call/SMS tools, number tools, and full REST passthrough.

## Owner authorization (mandatory)

- The **owner** creates the Twilio account and verifies any recipient number in the Twilio Console. Never ask for credentials, card details, or verification codes, and never act on their behalf.
- Never put auth tokens, API secrets, API keys, or phone numbers in chat, URLs, source files, or logs. Tool output is masked.
- **Live tools are blocked until owner onboarding is complete.** Walk the owner through the checklist, then attest with `twilio_onboarding_complete`. Do not guess or self-certify any step.
- Calls, SMS, number purchases, and routing changes require `confirm: true` **and** Claude's tool approval. Keep approval prompts enabled.
- Use `TWILIO_DRY_RUN=1` for read-only exploration. Use `TWILIO_ALLOW_ADMIN=1` only for explicitly authorized key/delete/admin operations.

## First run — owner onboarding gate

1. Call `twilio_setup_guide` for config steps, then `twilio_onboarding_guide` for the owner checklist.
2. Call `twilio_onboarding_status`. It shows exactly which steps are missing. Prompt the owner for each missing step:
   - Create a Twilio trial account at https://www.twilio.com/try-twilio.
   - Get a trial phone number in the Console.
   - Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (or API key pair), and `TWILIO_PHONE_NUMBER` in the shell or the 0600 credentials file.
   - Verify the recipient number in the Twilio Console.
   - Acknowledge trial limits and possible usage costs.
   - Confirm `twilio_status` and `twilio_list_phone_numbers` work.
3. Only after the owner explicitly confirms every item, call `twilio_onboarding_complete` with `verifiedRecipient`, `acknowledgeTrialLimits: true`, `acknowledgeCosts: true`, and `confirm: true`. Only the last four digits of the verified number are stored.
4. Call `twilio_status` and `twilio_list_phone_numbers` to confirm the caller ID.
5. Use `twilio_send_call` with `to` and `message` to place a one-way call. No webhook is needed.

If a live tool returns an onboarding error, stop and repeat step 2 — never bypass it with an environment flag in a real setup.

## Before a live action

- Confirm the destination number with the owner. Trial accounts can call/text only verified numbers.
- Verify onboarding is complete; the gate is enforced in shared code for all adapters.
- For `twilio_send_call`, pass exactly one of `message` (plain spoken text), `twiml`, or `url`.
- For `twilio_send_sms`, pass an E.164 `to` and a short `message`.
- Report the returned call/message SID and use `twilio_get_call` or `twilio_get_message` to verify the result. Never re-dial to "retry" without checking the first call.

## Full API coverage

`twilio_api_request` accepts `method`, `path`, `pathParams`, `query`, and `body`. Safety tier is derived from method/path. Check https://www.twilio.com/docs for exact endpoint shapes.
