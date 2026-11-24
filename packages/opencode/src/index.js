import { Plugin } from "@opencode/plugin";
import { TOOLS, callTool, permissionAction, RISK_READ } from "@agent-phone-number/core";

/**
 * OpenCode V2 server plugin.
 * Tools are registered as `twilio_<name>` via the `twilio` namespace.
 */
export default Plugin.define({
  id: "agent-phone-number",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "twilio",
        description:
          "Twilio phone number and REST API. Run twilio_onboarding_guide/status first; live calls/SMS/purchases/routing/admin actions stay blocked until owner onboarding is complete and require confirm:true.",
      });

      for (const tool of TOOLS) {
        const shortName = tool.name.replace(/^twilio_/, "");
        editor.add({
          name: shortName,
          description: tool.description,
          input: tool.input,
          options: { namespace: "twilio", codemode: true },
          execute: async (input, executionContext) => {
            const result = await callTool(tool.name, input ?? {}, {
              env: process.env,
              signal: executionContext.signal,
              permission: async ({ risk, action, tool: toolName, input: summary }) => {
                // Read-only tools skip the host prompt; everything else uses
                // OpenCode's permission rules (ask/deny/allow) with save support.
                if (risk === RISK_READ) return;
                await ctx.permission.assert({
                  sessionID: executionContext.sessionID,
                  agent: executionContext.agent,
                  source: {
                    type: "tool",
                    messageID: executionContext.messageID,
                    id: executionContext.id,
                  },
                  action,
                  resources: [toolName, ...Object.values(summary).map(String)],
                  save: [permissionAction(risk)],
                });
              },
            });
            return {
              content:
                typeof result.data === "string"
                  ? result.data
                  : JSON.stringify(result.data, null, 2),
            };
          },
        });
      }
    });

    return () => {
      // ctx.tool.transform registration is disposed automatically on unload.
    };
  },
});
