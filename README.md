# OKF Harness

OKF Harness is a macOS-first, agent-first local harness for maintaining
OKF-compatible LLM Wikis from Claude Code, Codex, and future coding agents.

This repository is in Phase 2. It contains the TypeScript pnpm monorepo scaffold,
core OKF primitives, and the first `okfh` CLI behavior for init, status, and lint.
Source ingestion, search, graph generation, and full agent-pack rendering will be
implemented in later phases.

## Packages

- `@okf-harness/core`: OKF parsing, config, manifest, path safety, lint, search, graph,
  and source handling.
- `@okf-harness/cli`: the `okfh` command-line entrypoint.
- `@okf-harness/agent-pack`: Claude and Codex adapter renderers and shared skill templates.
- `@okf-harness/mcp`: future optional MCP integration scaffold, not the v0.1 default path.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```

See [docs/implementation.md](docs/implementation.md) for the product and architecture spec.
