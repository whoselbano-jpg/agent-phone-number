# Codex setup

## Local bridge (recommended)

Append the contents of [`config.toml`](./config.toml) to `~/.codex/config.toml`, then verify:

```bash
codex mcp list
```

In the TUI, `/mcp` shows connection state. The bridge reads `TWILIO_ACCOUNT_SID` plus `TWILIO_AUTH_TOKEN` (or `TWILIO_API_KEY` + `TWILIO_API_SECRET`), and `TWILIO_PHONE_NUMBER` for the caller ID. A 0600 credentials file at `~/.config/agent-phone-number/twilio-credentials.json` is also supported.

For a read-only session:

```bash
export TWILIO_DRY_RUN=1
```

Twilio trial accounts can call and text only numbers you verified in the Twilio Console. The owner must complete verification; the agent must not ask for verification codes or credentials.

## Alternative: direct webhook

If you want inbound calls to speak a fixed message without this bridge, configure the number's `VoiceUrl` in the Twilio Console with an HTTPS endpoint that returns TwiML. This repo's `twilio_send_call` avoids that requirement by sending inline TwiML for outbound one-way calls.
