# OKF Harness

OKF Harness is a macOS-first, agent-first local harness for maintaining
OKF-compatible LLM Wikis from Claude Code, Codex, and future coding agents.

This repository is in Phase 0. It contains the TypeScript pnpm monorepo scaffold,
package boundaries, test runner, formatter/linter, and CI wiring. Runtime behavior
such as `okfh init`, source ingestion, wiki linting, graph generation, and MCP tools
will be implemented in later phases.

## Packages

- `@okf-harness/core`: OKF parsing, config, manifest, path safety, lint, search, graph,
  and source handling.
- `@okf-harness/cli`: the `okfh` command-line entrypoint.
- `@okf-harness/mcp`: stdio MCP server and tool handlers.
- `@okf-harness/agent-pack`: Claude and Codex adapter renderers and shared skill templates.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```

See [docs/implementation.md](docs/implementation.md) for the product and architecture spec.
