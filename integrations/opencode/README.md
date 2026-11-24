# OpenCode V2 setup

The published package is named `agent-phone-number`. Add it to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["agent-phone-number"]
}
```

For local development from this repo:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["./packages/opencode"]
}
```

OpenCode watches config and reloads plugins automatically; use `/reload` to force a reload. Tools are registered in the `bland` namespace and use the same catalog as the MCP bridge.

Paid and admin tools call `ctx.permission.assert`, so your existing OpenCode permission rules apply (including `deny` rules and saved approvals). Read-only tools skip the prompt.

To explore safely:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["agent-phone-number"],
  "permissions": [
    { "action": "bland:approve", "resource": "*", "effect": "deny" },
    { "action": "bland:admin", "resource": "*", "effect": "deny" }
  ]
}
```

Or set `BLAND_DRY_RUN=1` in the environment to disable all non-read Bland tools.
