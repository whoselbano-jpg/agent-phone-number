# agent-phone-number

Give your coding agent a phone number.

`agent-phone-number` is a small, unofficial plugin/MCP bridge that gives **OpenCode**, **Claude Code**, and **Codex** agents access to [Bland AI](https://www.bland.ai/) phone numbers — outbound calls, SMS, inbound number routing, agents, knowledge, analytics, and the rest of Bland's REST API — with one shared safety policy.

> This project is not affiliated with or endorsed by Bland AI. Bland's own hosted MCP server and `norm@bland` plugin also exist; see [Why another wrapper?](#why-another-wrapper).

## What you get

- **One shared core** (`packages/core`) with a Bland REST client, region support, credential storage, device onboarding, endpoint risk classification, and a redaction layer.
- **~40 curated tools** for the operations agents actually use, plus `bland_api_request` passthrough for **full REST coverage**.
- **Consistent guardrails everywhere**: calls, SMS, batches, purchases, routing changes, promotions, and admin actions require explicit owner approval and `confirm: true`.
- **No secrets in transcripts or the repo**: the approved API key is written to `~/.config/agent-phone-number/credentials.json` (mode 0600) or read from `BLAND_API_KEY`. Tool output shows only a fingerprint and masked number.
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

Config changes reload automatically. Tools appear under the `bland` namespace (for example `bland_status`, `bland_send_call`).

### Claude Code

```bash
claude plugin marketplace add <owner>/agent-phone-number
claude plugin install agent-phone-number
```

Or test locally:

```bash
claude --plugin-dir ./integrations/claude-code
# inside Claude Code: /reload-plugins
```

The plugin starts `agent-phone-number-mcp` through `npx` and includes a `bland-phone` skill with the safety workflow.

### Codex

Append [`integrations/codex/config.toml`](integrations/codex/config.toml) to `~/.codex/config.toml`, then run `codex mcp list`. In the TUI, `/mcp` shows connection state.

```toml
[mcp_servers.bland]
command = "npx"
args = ["-y", "agent-phone-number-mcp@0.1.0"]
env_vars = ["BLAND_API_KEY", "BLAND_REGION", "BLAND_CREDENTIALS_FILE"]
default_tools_approval_mode = "prompt"
```

## First run

1. Ask the agent to run `bland_status`.
2. Run `bland_connect_start`. It returns a verification URL and a user code.
3. **The owner** opens the URL, signs up / starts the Agent Phone Plan, and approves the code in their browser. Never ask for payment details and never approve on their behalf.
4. Run `bland_connect_poll`. On approval, the key is stored outside the repo; the result contains only a fingerprint and masked phone number.
5. Inspect the account with `bland_list_voices`, `bland_list_phone_numbers`, and `bland_list_agents` before placing any live traffic.

## Safety model

| Tier | Examples | Behavior |
| --- | --- | --- |
| `read` | `bland_list_agents`, `bland_get_call`, `bland_query_analytics` | Runs without an extra prompt. |
| `write` | `bland_create_agent`, `bland_save_agent_version`, knowledge uploads | Host approval prompt (Claude/Codex) or OpenCode permission rule. |
| `approve` | `bland_send_call`, `bland_send_sms`, `bland_create_batch`, `bland_purchase_phone_number` | Requires `confirm: true` **and** host approval. |
| `admin` | Bland's hosted MCP passthrough for billing/keys/SIP/deletes via `bland_api_request` | Blocked unless `BLAND_ALLOW_ADMIN=1`, then requires `confirm: true`. |

Environment switches:

- `BLAND_DRY_RUN=1` — disables every non-read tool.
- `BLAND_ALLOW_ADMIN=1` — enables admin-tier operations (owner authorization required).
- `BLAND_REGION=us|eu|ca|asia|au` — selects the regional API/app hosts.
- `BLAND_CREDENTIALS_FILE` — override the credential file path.
- `BLAND_AUTH_SCHEME=raw|bearer` — raw `authorization: <key>` is the Bland REST default.

Bland's Agent Phone Plan limits: 1 concurrent call, 20 calls/hour, 50 calls/day, 20 texts/hour, 100 texts/day, US/CA destinations, $9.99 first month then $19.99/month. See [Bland's plan docs](https://docs.bland.ai/platform/agent-phone-plan.md).

## Tool catalog

Setup: `bland_status`, `bland_connect_start`, `bland_connect_poll`, `bland_disconnect`, `bland_setup_guide`.

Reads: agents and versions, environments, number bindings, calls and active calls, voices, analytics, batches, SMS conversations, phone numbers, knowledge items, contacts, tools, dispositions.

Writes: create agent, save agent version, upload knowledge text/file.

Approved actions: send call, stop call, send SMS, create batch, attach numbers, promote agent, purchase number.

Full coverage: `bland_api_request` accepts any `method` + `path` + `pathParams` + `query` + `body`. Its risk tier is derived from the endpoint registry in [`packages/core/src/endpoints.js`](packages/core/src/endpoints.js). Check [Bland's docs index](https://docs.bland.ai/llms.txt) for exact endpoint shapes.

## Why another wrapper?

Bland already publishes a hosted MCP server (`https://api.bland.ai/v1/mcp`) and the `norm@bland` plugin. Those are excellent, but:

- this repo gives **one identical tool contract and safety policy across OpenCode, Claude Code, and Codex**;
- the local bridge keeps device onboarding and credential handling in one place instead of asking the agent to paste a key into config;
- the confirmation gate lives in shared code, not only in host annotations (Bland's MCP server does not ask for confirmation itself).

You can still point Codex or Claude Code at Bland's hosted MCP directly; snippets are in [`integrations/codex/README.md`](integrations/codex/README.md).

## Development

```bash
npm install
npm test
npm run lint
```

Tests are plain `node:test` with a mocked `fetch`, so they make no network calls.

## Repository layout

```text
packages/core/        shared client, tools, safety policy, onboarding
packages/opencode/    OpenCode V2 plugin (package name: agent-phone-number)
packages/mcp/         stdio MCP bridge (package name: agent-phone-number-mcp)
integrations/         Claude Code plugin and Codex config
docs/                 security notes and endpoint catalog notes
```

## License

MIT — see [LICENSE](LICENSE).
