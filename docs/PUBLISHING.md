# Publishing

Three npm packages make up the installable surface:

1. `@agent-phone-number/core` — shared library.
2. `agent-phone-number` — OpenCode V2 plugin.
3. `agent-phone-number-mcp` — stdio MCP bridge used by Claude Code and Codex.

Publish core first, then the adapters (they depend on version `0.1.0`).

```bash
npm install
npm test
npm run lint
npm publish -w packages/core
npm publish -w packages/opencode
npm publish -w packages/mcp
```

For a local marketplace, point Claude Code at a checkout:

```bash
claude plugin marketplace add whoselbano-jpg/agent-phone-number
claude plugin install agent-phone-number
```

GitHub Actions runs syntax checks and `node:test` on Node 20 and 22 for pushes and pull requests to `main`.
