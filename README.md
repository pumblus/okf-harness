# OKF Harness

OKF Harness is a macOS-first, agent-first local harness for maintaining
OKF-compatible LLM Wikis from Claude Code, Codex, and future coding agents.

This repository is in Phase 6. It contains the TypeScript pnpm monorepo scaffold,
core OKF primitives, `okfh` init/status/lint/source/ingest/search/read/graph
behavior, terminal-native doctor checks, and Claude/Codex adapter rendering through
the agent pack.

Ask Claude Code or Codex questions through the generated OKF Harness query skill,
or use the CLI directly:

```bash
okfh search "LLM Wiki" --workspace <workspace> --json
okfh read topics/llm-wiki --workspace <workspace> --json
okfh graph --workspace <workspace> --json
okfh doctor --workspace <workspace> --json
```

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

See [docs/implementation.md](docs/implementation.md) for the product and architecture spec, and [docs/ROADMAP.md](docs/ROADMAP.md) for the public product roadmap.
