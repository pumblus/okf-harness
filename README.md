# OKF Harness

OKF Harness is a macOS-first, agent-first local harness for maintaining
OKF-compatible LLM Wikis from Claude Code, Codex, and future coding agents.

This repository is in Phase 3. It contains the TypeScript pnpm monorepo scaffold,
core OKF primitives, `okfh` init/status/lint behavior, and Claude/Codex adapter
rendering through the agent pack. Source ingestion, search, and graph generation
will be implemented in later phases.

## Packages

- `@okf-harness/core`: OKF parsing, config, manifest, path safety, lint, search, graph,
  and source handling.
- `@okf-harness/cli`: the `okfh` command-line entrypoint and terminal-native JSON surface.
- `@okf-harness/agent-pack`: Claude and Codex adapter renderers, managed root guidance,
  and shared skill templates.
- `@okf-harness/mcp`: future optional MCP integration scaffold, not the v0.1 default path.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```

See [docs/implementation.md](docs/implementation.md) for the product and architecture spec.
