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

OpenCode watches config and reloads plugins automatically; use `/reload` to force a reload. Tools are registered in the `twilio` namespace and use the same catalog as the MCP bridge.

Paid and admin tools call `ctx.permission.assert`, so your existing OpenCode permission rules apply (including `deny` rules and saved approvals). Read-only tools skip the prompt.

To explore safely:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["agent-phone-number"],
  "permissions": [
    { "action": "twilio:approve", "resource": "*", "effect": "deny" },
    { "action": "twilio:admin", "resource": "*", "effect": "deny" }
  ]
}
```

Or set `TWILIO_DRY_RUN=1` in the environment to disable all non-read Twilio tools.

## Owner onboarding gate

Live tools (`twilio_send_call`, `twilio_send_sms`, `twilio_purchase_number`, `twilio_configure_number`) are blocked until the owner checklist is complete. Ask the agent to run `twilio_setup_guide`, `twilio_onboarding_guide`, and `twilio_onboarding_status`. Walk the owner through every missing step, then call `twilio_onboarding_complete` with `verifiedRecipient`, `acknowledgeTrialLimits: true`, `acknowledgeCosts: true`, and `confirm: true` only after the owner explicitly confirms. In a real setup never set `TWILIO_ONBOARDING_COMPLETE=1`; it exists only for CI/tests.

Note: the Twilio trial is 30 days with 75 voice minutes, 100 SMS, 5 verified recipients, sign-up-country-only calling, and a shared number. Custom SMS bodies and inline-TwiML calls need an upgraded account.
