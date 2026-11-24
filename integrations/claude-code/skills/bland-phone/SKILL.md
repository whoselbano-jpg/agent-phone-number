---
name: bland-phone
description: Give Claude Code a Bland AI phone number, then place calls or send SMS with owner-approval guardrails. Use when the user asks for an AI phone number, an agent phone line, or to call/text via Bland.
---

# Bland phone tools

The `bland` MCP server exposes `bland_status`, `bland_connect_start`, `bland_connect_poll`, call/SMS tools, and full REST passthrough.

## Owner authorization (mandatory)

- The **owner** signs up and approves the Agent Phone Plan in their own browser. Never ask for payment details, card numbers, or credentials, and never approve a purchase on their behalf.
- Never put API keys, device codes, verification codes, or phone numbers in chat, URLs, source files, or logs. Tool output is masked.
- Calls, SMS, batches, purchases, routing changes, promotions, and admin actions require `confirm: true` **and** Claude's tool approval. Keep approval prompts enabled.
- Use `BLAND_DRY_RUN=1` for read-only exploration. Use `BLAND_ALLOW_ADMIN=1` only for explicitly authorized billing/key/SIP/delete operations.

## First run

1. Call `bland_status`.
2. If not connected, call `bland_connect_start`. Show the returned verification URL and user code to the owner. Do not ask them to paste a key here.
3. Call `bland_connect_poll` once after the owner says they approved. On success the key is stored outside the repository and only a fingerprint is returned.
4. Use `bland_list_voices`, `bland_list_phone_numbers`, and `bland_list_agents` to inspect the account before any live action.

## Before a live action

- Confirm the destination number and the agent/version with the owner.
- For `bland_send_call`, supply Bland v1 snake_case fields and exactly one route: `agent_id` + `agent_version`, or `persona_id`, `pathway_id`, or `task`.
- For `bland_send_sms`, use E.164 `user_number` and `agent_number`, plus `agent_message` or `objective`.
- Report the returned `call_id` and use `bland_get_call` to verify the result. Never re-dial to "retry" without checking the first call.

## Full API coverage

`bland_api_request` accepts `method`, `path`, `pathParams`, `query`, and `body`. Safety tier is derived from the method/path. Check https://docs.bland.ai/llms.txt for exact endpoint shapes.
