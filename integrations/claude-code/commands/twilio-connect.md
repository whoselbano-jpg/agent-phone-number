---
description: Connect Claude Code to a Twilio phone number (owner onboarding required)
---

Use the `twilio-phone` skill and the `twilio` MCP tools. Start with `twilio_setup_guide`, `twilio_onboarding_guide`, and `twilio_onboarding_status`. Walk the owner through every missing step: create the trial account, get a trial number, set credentials in their shell or the 0600 file, verify the recipient number in the Console, and acknowledge trial limits/costs. Never ask them to paste credentials or verification codes into chat.

Only after the owner explicitly confirms every step, call `twilio_onboarding_complete` with `verifiedRecipient`, `acknowledgeTrialLimits: true`, `acknowledgeCosts: true`, and `confirm: true`. Live tools (`twilio_send_call`, `twilio_send_sms`, `twilio_purchase_number`, `twilio_configure_number`) stay blocked until then — do not bypass the gate with environment flags in a real setup.
