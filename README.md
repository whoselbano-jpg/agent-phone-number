# agent-phone-number

Give your coding agent a phone number — **without Bland**.

`agent-phone-number` is a small, unofficial plugin/MCP bridge that gives **OpenCode**, **Claude Code**, and **Codex** agents a [Twilio](https://www.twilio.com/) phone number: outbound one-way voice calls, SMS, number management, call logs, and the rest of Twilio's REST API — with one shared safety policy.

> This project is not affiliated with or endorsed by Twilio. Bland was removed in v0.2: its Agent Phone Plan costs $9.99 first month / $19.99 month, and the main free SIP DID programs were discontinued by 2026.

## What is actually free

**The plugin is free (MIT). Phone service is only free for a limited 30-day trial — this is not a permanent free phone line.**

Twilio's current trial (verified November 2026): no credit card, 30 days, **75 voice minutes**, **100 SMS**, up to **5 verified recipients**, calls/texts only within your sign-up country, and a **shared Twilio trial number** that varies by product/recipient and cannot be kept after upgrade.

| Feature | Free trial | After upgrade |
| --- | --- | --- |
| `twilio_status`, call/message logs, number search | Yes | Yes |
| `twilio_send_call` with `message` / inline TwiML | Not reliable — trial call creation is documented as accepting only `To`, a Twilio template webhook URL, and `StatusCallback` | Yes, no webhook needed |
| `twilio_send_sms` with a custom body | No — trial requires Twilio's pre-defined templates | Yes |
| Dedicated number you keep | No — shared trial number only | First month free for US Local / US-Canada Toll-free, then ~$1/month + usage |

After 30 days, or when you need custom messages or your own number, you must upgrade with payment details. A permanently free, unrestricted number with automated AI calling does not currently exist from a reputable provider.

## What you get

- **One shared core** (`packages/core`) with a Twilio REST client, credential storage, endpoint risk classification, and redaction.
- **~20 curated tools** plus `twilio_api_request` passthrough for full REST coverage.
- **Consistent guardrails everywhere**: calls, SMS, purchases, routing changes, and admin actions require explicit owner approval and `confirm: true`.
- **No secrets in transcripts or the repo**: credentials come from environment variables or a `0600` file at `~/.config/agent-phone-number/twilio-credentials.json`. Tool output shows only fingerprints and masked numbers.
- **Adapters for all three agents**: an OpenCode V2 plugin, a Claude Code plugin, and a stdio MCP server for Codex (or any MCP client).

## Install

### OpenCode (V2)

Add to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["agent-phone-number"]
}
```

Config changes reload automatically. Tools appear under the `twilio` namespace (for example `twilio_status`, `twilio_send_call`).

### Claude Code

```bash
claude plugin marketplace add whoselbano-jpg/agent-phone-number
claude plugin install agent-phone-number
```

Or test locally:

```bash
claude --plugin-dir ./integrations/claude-code
# inside Claude Code: /reload-plugins
```

The plugin starts `agent-phone-number-mcp` through `npx` and includes a `twilio-phone` skill with the safety workflow.

### Codex

Append [`integrations/codex/config.toml`](integrations/codex/config.toml) to `~/.codex/config.toml`, then run `codex mcp list`. In the TUI, `/mcp` shows connection state.

```toml
[mcp_servers.twilio]
command = "npx"
args = ["-y", "agent-phone-number-mcp@0.2.0"]
env_vars = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_CREDENTIALS_FILE"]
default_tools_approval_mode = "prompt"
```

> The npm packages are not published yet. Until they are, replace the `npx` command with `node <repo>/packages/mcp/src/index.js` (or `npm link`). See [`docs/PUBLISHING.md`](docs/PUBLISHING.md).

## First run — owner checklist

The plugin prompts through these steps and **blocks live tools until they are finished**. A human can also run `npm run onboarding` from a checkout for the same checklist.

1. Create a Twilio trial account at <https://www.twilio.com/try-twilio>.
2. Verify your own recipient number in the Console and note the shared trial number shown in the Try out flow (it varies by product and recipient; it is not a number you own).
3. Set credentials in your shell (never in chat or a repo file):

   ```bash
   export TWILIO_ACCOUNT_SID=AC...
   export TWILIO_AUTH_TOKEN=...
   export TWILIO_PHONE_NUMBER=+1...
   ```

   An API key pair is also supported: `TWILIO_API_KEY` + `TWILIO_API_SECRET`.

4. Ask the agent to run `twilio_onboarding_guide` and `twilio_onboarding_status`. It will show exactly which steps are missing.
5. After the owner confirms the steps, run `twilio_onboarding_complete` with `verifiedRecipient`, `acknowledgeTrialLimits: true`, `acknowledgeCosts: true`, and `confirm: true`. Only the last four digits of the verified number are stored.
6. Run `twilio_status` and `twilio_list_phone_numbers`.
7. Run `twilio_send_call` with `to` and `message` to place a one-way call. On an **upgraded** account the agent speaks your message with Twilio text-to-speech and no webhook is needed. On a free trial, Twilio's Call API is limited to its template webhook URLs, so use the Console **Try out Voice** flow for test calls until you upgrade.
8. Run `twilio_get_call` with the returned SID to confirm status, duration, and price.

`twilio_send_call`, `twilio_send_sms`, `twilio_purchase_number`, and `twilio_configure_number` return an actionable error if this checklist is incomplete.

## Safety model

| Tier | Examples | Behavior |
| --- | --- | --- |
| `read` | `twilio_list_calls`, `twilio_get_call`, `twilio_list_phone_numbers`, `twilio_get_usage` | Runs without an extra prompt. |
| `write` | `twilio_disconnect` | Host approval prompt where supported. |
| `approve` | `twilio_onboarding_complete`, `twilio_send_call`, `twilio_send_sms`, `twilio_purchase_number`, `twilio_configure_number` | Requires `confirm: true` **and** host approval. |
| `admin` | Key deletion, record deletion, billing/account changes via `twilio_api_request` | Blocked unless `TWILIO_ALLOW_ADMIN=1`, then requires `confirm: true`. |

Environment switches:

- `TWILIO_DRY_RUN=1` — disables every non-read tool.
- `TWILIO_ALLOW_ADMIN=1` — enables admin-tier operations (owner authorization required).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` — account credentials.
- `TWILIO_API_KEY`, `TWILIO_API_SECRET` — alternative API-key credentials.
- `TWILIO_PHONE_NUMBER` — default caller ID / SMS sender (E.164).
- `TWILIO_CREDENTIALS_FILE` — override the credential file path.
- `TWILIO_TIMEOUT_MS` — request timeout (default 60000).

## Tool catalog

Setup: `twilio_status`, `twilio_setup_guide`, `twilio_onboarding_guide`, `twilio_onboarding_status`, `twilio_onboarding_complete`, `twilio_disconnect`.

Reads: phone numbers, available numbers, calls, call events, messages, usage records.

Approved actions: send call, cancel call, send SMS, configure number, purchase number.

Full coverage: `twilio_api_request` accepts any `method` + `path` + `pathParams` + `query` + `body`. Its risk tier is derived from the endpoint registry in [`packages/core/src/endpoints.js`](packages/core/src/endpoints.js). Check [Twilio's docs](https://www.twilio.com/docs) for exact endpoint shapes.

## Why not Bland?

- Bland's own number costs $9.99 first month, then $19.99/month; no free dedicated number.
- This repo keeps one identical tool contract and safety policy across OpenCode, Claude Code, and Codex.
- The confirmation gate lives in shared code, not only in host annotations.
- Outbound one-way calls use Twilio's inline `Twiml` parameter, so there is no server to host for basic usage on an upgraded account. Free-trial call creation is limited to Twilio's template webhook URLs.

## Development

```bash
npm install
npm test
npm run lint
```

On Windows where `npm.ps1` is blocked, run `node scripts/test.js` and `node scripts/lint.js` directly.

Tests are plain `node:test` with a mocked `fetch`, so they make no network calls.

## Repository layout

```text
packages/core/        shared Twilio client, tools, safety policy, credentials
packages/opencode/    OpenCode V2 plugin (package name: agent-phone-number)
packages/mcp/         stdio MCP bridge (package name: agent-phone-number-mcp)
integrations/         Claude Code plugin and Codex config
docs/                 security notes and publishing notes
tasks/                implementation plan and task list
```

## License

MIT — see [LICENSE](LICENSE).
