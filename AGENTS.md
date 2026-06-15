# OKF Harness Agent Instructions

## Source of Truth

- Product and architecture spec: `docs/implementation.md`.
- Current repository state: Phase 1 core is implemented. CLI, MCP, agent-pack runtime behavior, source management, search, and graph generation are still future phase work.
- Implement phases in order from `docs/implementation.md` section 11.2. Do not jump ahead to later phases unless the user asks.

## Project Boundaries

- OKF Harness is macOS-first, agent-first, local-first, and open source.
- Runtime target: Node.js 22+, TypeScript, ESM, pnpm.
- v0.1 supports Claude Code and Codex first. Pi and OpenCode are roadmap work.
- v0.1 does not include Obsidian runtime code, GUI, cloud sync, accounts, team permissions, vector databases, background daemons, Windows/Linux support, automatic web crawling, silent bulk wiki rewrites, or a private agent runtime.
- The core package must not depend on CLI, Agent, or MCP packages.
- The agent-pack package renders shared templates for Claude and Codex adapters; do not maintain divergent manual skill copies.
- The mcp package wraps core behavior and must not expose arbitrary file write tools.
- The cli package connects core, agent-pack, and mcp behavior.

## Planned Repo Map

- `docs/implementation.md`: current implementation spec and phased roadmap.
- `packages/core`: OKF parsing, config, manifest, path safety, lint, search, graph, source handling.
- `packages/cli`: `okfh` command line entrypoint and commands.
- `packages/mcp`: stdio MCP server and tool handlers.
- `packages/agent-pack`: Claude/Codex adapter renderers and shared skill templates.
- `packages/mac`: optional macOS helpers after the core MVP.
- `templates/workspace`: generated OKF workspace skeletons.
- `examples/minimal-workspace`: fixture workspace and sample sources.

## Working Rules

- Before editing, check the current tree with `git status --short`.
- Keep changes scoped to the active phase or the user's explicit request.
- Do not auto-commit, tag, push, publish, or create releases unless the user explicitly asks in the current turn.
- Do not store API keys, tokens, or credentials in tracked files.
- Do not edit generated raw source files in OKF workspaces. `raw/sources/` is immutable by design.
- For source ingestion behavior, copy source files and record hashes; never move or rewrite the user's originals.
- For write-capable CLI or MCP behavior, support dry-run or a pending action before overwriting files.

## Verification

- Until Phase 0 creates `package.json` and the pnpm toolchain, there is no project-level executable verifier.
- After Phase 0 exists, the default checks are:

```bash
pnpm test
pnpm typecheck
```

- After workspace/wiki edits, run:

```bash
okfh lint --json
```

- After file changes, inspect:

```bash
git diff
git status --short
```

## Documentation Rules

- Keep `AGENTS.md` as the shared project instruction source.
- Keep runtime-specific files thin. `CLAUDE.md` should delegate here instead of duplicating guidance.
- Put stable project decisions in tracked docs. Do not copy one-off review reports, local machine paths, private preferences, or dated diagnostics into public instructions.
