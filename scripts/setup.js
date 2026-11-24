#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { onboardingGuide, onboardingStatus, completeOnboarding } from "../packages/core/src/onboarding.js";

const rl = createInterface({ input: stdin, output: stdout });

try {
  const guide = onboardingGuide();
  const status = await onboardingStatus({ env: process.env });

  stdout.write(`\n${guide.title}\n`);
  stdout.write(`${guide.warning}\n\n`);
  for (const step of guide.steps) {
    const current = status.steps.find((item) => item.id === step.id);
    stdout.write(`${current?.done ? "[x]" : "[ ]"} ${step.title}\n    ${step.detail}\n`);
  }

  if (status.complete) {
    stdout.write("\nOnboarding is already complete. Live tools are unlocked.\n");
  } else {
    const answer = (await rl.question("\nHave you completed every unchecked step? (yes/no): ")).trim().toLowerCase();
    if (answer !== "yes") {
      stdout.write("Stopped. Re-run this checklist before using live tools.\n");
      process.exitCode = 1;
    } else {
      const recipient = (await rl.question("Verified recipient number in E.164 (+1...): ")).trim();
      const acknowledge = (
        await rl.question("Acknowledge trial limits and possible usage costs? (yes/no): ")
      )
        .trim()
        .toLowerCase();
      if (acknowledge !== "yes") {
        stdout.write("Stopped. The owner must acknowledge trial limits and costs.\n");
        process.exitCode = 1;
      } else {
        const result = await completeOnboarding({
          verifiedRecipient: recipient,
          acknowledgeTrialLimits: true,
          acknowledgeCosts: true,
          env: process.env,
        });
        stdout.write(`\n${result.message}\n`);
      }
    }
  }
} catch (error) {
  stderrWrite(error?.message || String(error));
  process.exitCode = 1;
} finally {
  rl.close();
}

function stderrWrite(message) {
  process.stderr.write(`${message}\n`);
}
