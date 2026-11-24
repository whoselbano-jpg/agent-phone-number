# Publishing

Three npm packages make up the installable surface. They are currently **not published**; the integration configs reference version `0.2.0` as a placeholder for the first Twilio-edition release.

1. `@agent-phone-number/core` — shared library.
2. `agent-phone-number` — OpenCode V2 plugin.
3. `agent-phone-number-mcp` — stdio MCP bridge used by Claude Code and Codex.

Publish core first, then the adapters (they depend on version `0.2.0`).

```bash
npm install
npm test
npm run lint
npm publish -w packages/core
npm publish -w packages/opencode
npm publish -w packages/mcp
```

Until publishing, run the MCP bridge from a checkout:

```toml
[mcp_servers.twilio]
command = "node"
args = ["/absolute/path/to/agent-phone-number/packages/mcp/src/index.js"]
```

For a local Claude Code marketplace, point at a checkout:

```bash
claude plugin marketplace add whoselbano-jpg/agent-phone-number
claude plugin install agent-phone-number
```

GitHub Actions runs syntax checks and `node:test` on Node 20 and 22 for pushes and pull requests to `main`.
