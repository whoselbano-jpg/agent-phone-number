import { loadCredentials, saveCredentials } from "./credentials.js";
import { maskPhone, redact } from "./redact.js";

const STEPS = [
  {
    id: "account",
    title: "Create a Twilio trial account",
    detail: "The owner signs up at https://www.twilio.com/try-twilio. The agent cannot do this safely.",
  },
  {
    id: "credentials",
    title: "Configure credentials",
    detail:
      "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (or TWILIO_API_KEY + TWILIO_API_SECRET), and TWILIO_PHONE_NUMBER in the shell or a 0600 credentials file.",
  },
  {
    id: "number",
    title: "Note the shared trial number",
    detail: "Trial accounts use a shared Twilio-owned number shown in the Console Try out flow. It varies by product/recipient and cannot be kept after upgrade; a dedicated number requires a paid account.",
  },
  {
    id: "verifiedRecipient",
    title: "Verify the recipient number",
    detail:
      "The owner verifies their own phone number in the Twilio Console. Trial accounts can call/text only verified numbers.",
  },
  {
    id: "trialLimits",
    title: "Acknowledge trial limits and costs",
    detail:
      "The owner acknowledges the 30-day expiry, 75 voice minutes/100 SMS, 5 verified recipients, sign-up-country restriction, shared number, paid-upgrade requirement, and that custom SMS bodies and inline-TwiML calls need an upgraded account.",
  },
  {
    id: "firstRun",
    title: "Confirm the bridge works",
    detail: "Run twilio_status and twilio_list_phone_numbers. Use the Console Try out Voice flow for trial test calls; custom-message calls via twilio_send_call require an upgraded account.",
  },
];

function isE164(value) {
  return /^\+[1-9]\d{7,14}$/.test(String(value || "").trim());
}

/** Return the human onboarding checklist with local completion status. */
export async function onboardingStatus({ env = process.env } = {}) {
  const creds = await loadCredentials({ env });
  const marker = creds.onboarding || {};
  const envComplete = env.TWILIO_ONBOARDING_COMPLETE === "1";
  const envVerified = env.TWILIO_VERIFIED_RECIPIENT === "1";

  const done = {
    account: Boolean(creds.accountSid),
    credentials: Boolean(creds.accountSid && creds.password),
    number: Boolean(creds.phoneNumber),
    verifiedRecipient: envComplete || envVerified || Boolean(marker.verifiedRecipientLast4),
    trialLimits: envComplete || Boolean(marker.trialLimitsAcknowledged),
    firstRun: envComplete || Boolean(marker.completedAt),
  };

  const steps = STEPS.map((step) => ({ ...step, done: Boolean(done[step.id]) }));
  const complete = steps.every((step) => step.done);
  const next = steps.find((step) => !step.done) || null;
  return {
    complete,
    steps,
    next,
    verifiedRecipient: marker.verifiedRecipientLast4 ? maskPhone(marker.verifiedRecipientLast4) : "none",
    completedAt: marker.completedAt || null,
    credentialsFile: creds.file,
    message: complete
      ? "Twilio onboarding is complete. Live tools are unlocked."
      : `Finish this step before live actions: ${next.title}. Run twilio_onboarding_guide for details.`,
  };
}

/**
 * Owner attestation. This does not verify with Twilio; it records that the
 * owner completed the out-of-band steps that the API cannot prove.
 */
export async function completeOnboarding({
  verifiedRecipient,
  acknowledgeTrialLimits,
  acknowledgeCosts,
  env = process.env,
} = {}) {
  if (!isE164(verifiedRecipient)) {
    throw new Error("verifiedRecipient must be an E.164 number such as +14155550100.");
  }
  if (acknowledgeTrialLimits !== true || acknowledgeCosts !== true) {
    throw new Error("The owner must acknowledge both trial limits and potential costs.");
  }
  const current = await onboardingStatus({ env });
  if (!current.steps.find((step) => step.id === "credentials").done) {
    throw new Error("Configure credentials first. See twilio_onboarding_guide.");
  }

  const number = verifiedRecipient.trim();
  const file = await saveCredentials(
    {
      onboarding: {
        verifiedRecipientLast4: number.slice(-4),
        trialLimitsAcknowledged: true,
        costsAcknowledged: true,
        completedAt: new Date().toISOString(),
      },
    },
    { env },
  );
  const status = await onboardingStatus({ env });
  return {
    status: "complete",
    verifiedRecipient: maskPhone(number),
    credentialsFile: file,
    complete: status.complete,
    message:
      "Owner steps recorded. Only verified numbers can be called/texted on a trial account. You can now use live Twilio tools with confirm:true.",
  };
}

export function onboardingGuide() {
  return {
    title: "Twilio phone setup — owner checklist",
    warning:
      "Do not use live tools until every step is confirmed. Twilio trials expire after 30 days, use a shared number, allow 5 verified recipients in the sign-up country only, and do not support custom SMS bodies or inline-TwiML calls.",
    steps: STEPS,
    tools: {
      status: "twilio_onboarding_status",
      complete: "twilio_onboarding_complete",
      firstAction: "twilio_send_call",
    },
    note: redact("Never paste credentials, verification codes, or phone numbers into source control."),
  };
}

/** Live tools are blocked until the owner checklist is complete. */
export async function assertOnboardingComplete(name, { env = process.env } = {}) {
  const LIVE_TOOLS = new Set([
    "twilio_send_call",
    "twilio_send_sms",
    "twilio_purchase_number",
    "twilio_configure_number",
  ]);
  if (!LIVE_TOOLS.has(name)) return null;
  const status = await onboardingStatus({ env });
  if (status.complete) return status;
  const missing = status.steps.filter((step) => !step.done).map((step) => step.title);
  const error = new Error(
    `Twilio onboarding is not finished. Run twilio_onboarding_guide and twilio_onboarding_status, then twilio_onboarding_complete after the owner confirms. Missing: ${missing.join("; ")}.`,
  );
  error.name = "OnboardingError";
  error.detail = { status, missing };
  throw error;
}
