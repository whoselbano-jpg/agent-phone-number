---
name: twilio-phone
description: Give Claude Code a Twilio phone number, then place one-way voice calls or send SMS with owner-approval guardrails. Use when the user asks for an AI phone number, an agent phone line, or to call/text via Twilio.
---

# Twilio phone tools

The `twilio` MCP server exposes `twilio_status`, `twilio_setup_guide`, call/SMS tools, number tools, and full REST passthrough.

## Owner authorization (mandatory)

- The **owner** creates the Twilio account and verifies any recipient number in the Twilio Console. Never ask for credentials, card details, or verification codes, and never act on their behalf.
- Never put auth tokens, API secrets, API keys, or phone numbers in chat, URLs, source files, or logs. Tool output is masked.
- Calls, SMS, number purchases, and routing changes require `confirm: true` **and** Claude's tool approval. Keep approval prompts enabled.
- Use `TWILIO_DRY_RUN=1` for read-only exploration. Use `TWILIO_ALLOW_ADMIN=1` only for explicitly authorized key/delete/admin operations.

## First run

1. Call `twilio_status`.
2. If not connected, tell the owner to set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` in the shell, or write the 0600 credentials file described by `twilio_setup_guide`.
3. Use `twilio_list_phone_numbers` to confirm the caller ID.
4. Use `twilio_send_call` with `to` and `message` to place a one-way call. No webhook is needed.

## Before a live action

- Confirm the destination number with the owner. Trial accounts can call/text only verified numbers.
- For `twilio_send_call`, pass exactly one of `message` (plain spoken text), `twiml`, or `url`.
- For `twilio_send_sms`, pass an E.164 `to` and a short `message`.
- Report the returned call/message SID and use `twilio_get_call` or `twilio_get_message` to verify the result. Never re-dial to "retry" without checking the first call.

## Full API coverage

`twilio_api_request` accepts `method`, `path`, `pathParams`, `query`, and `body`. Safety tier is derived from method/path. Check https://www.twilio.com/docs for exact endpoint shapes.
