# Codex setup

## Local bridge (recommended)

Append the contents of [`config.toml`](./config.toml) to `~/.codex/config.toml`, then verify:

```bash
codex mcp list
```

In the TUI, `/mcp` shows connection state. The bridge reads `BLAND_API_KEY` or the credentials file at `~/.config/agent-phone-number/credentials.json`.

For a read-only session:

```bash
export BLAND_DRY_RUN=1
```

## Alternative: Bland's hosted MCP

If you prefer Bland's first-party MCP server instead of this bridge:

```toml
[mcp_servers.bland]
url = "https://api.bland.ai/v1/mcp"
bearer_token_env_var = "BLAND_API_KEY"
default_tools_approval_mode = "prompt"
```

Hosted MCP has broad tool coverage but does not enforce this repo's confirmation policy by itself — keep Codex approval prompts enabled. This bridge is preferred when you want consistent guardrails across OpenCode, Claude Code, and Codex.
