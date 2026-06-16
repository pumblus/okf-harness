# OKF Harness Agent Instructions

## Source of Truth

- Product and architecture spec: `docs/implementation.md`.
- Current repository state: Phase 6 Terminal-native hardening is implemented. CLI init/status/lint/source/ingest/search/read/graph/doctor and Claude/Codex adapter rendering are in place. MCP is future optional integration, not the v0.1 default path.
- Implement phases in order from `docs/implementation.md` section 11.2. Do not jump ahead to later phases unless the user asks.

## Project Boundaries

- OKF Harness is macOS-first, agent-first, local-first, and open source.
- Runtime target: Node.js 22+, TypeScript, ESM, pnpm.
- v0.1 supports Claude Code and Codex first. Pi and OpenCode are roadmap work.
- v0.1 does not include Obsidian runtime code, GUI, cloud sync, accounts, team permissions, vector databases, background daemons, Windows/Linux support, automatic web crawling, silent bulk wiki rewrites, or a private agent runtime.
- The core package must not depend on CLI, Agent, or MCP packages.
- The agent-pack package renders shared templates for Claude and Codex adapters; do not maintain divergent manual skill copies.
- The cli package connects core and agent-pack behavior through `okfh --json`.
- The mcp package is future optional integration and must not become the default v0.1 tool path.

## Planned Repo Map

- `docs/implementation.md`: current implementation spec and phased roadmap.
- `packages/core`: OKF parsing, config, manifest, path safety, lint, search, graph, source handling.
- `packages/cli`: `okfh` command line entrypoint and commands.
- `packages/mcp`: future optional MCP integration scaffold.
- `packages/agent-pack`: Claude/Codex adapter renderers and shared skill templates.
- `packages/mac`: optional macOS helpers after the core MVP.
- `packages/core/src/workspace/index.ts`: generated OKF Harness workspace skeleton and workspace plan until a durable template directory exists.
- `packages/core/test/fixtures/valid-workspace`: fixture workspace and sample sources used by core and CLI tests.

## Hotspot Ownership

- `docs/implementation.md` owns the product scope, architecture decisions, and phased roadmap. Keep section 11.2 as the phase gate; do not move future-phase behavior into current code unless the user explicitly asks. Verify meaningful edits with `pnpm typecheck` and the relevant package tests.
- `packages/core/src/workspace/index.ts` owns the OKF Harness workspace skeleton and workspace plan. Keep it free of agent-pack dependencies. Verify with `pnpm test packages/core/test` and `pnpm typecheck`.
- `packages/agent-pack/src/index.ts` owns Claude/Codex skill rendering, root guidance managed blocks, and adapter install planning. Verify with `pnpm test packages/agent-pack/test` and `pnpm typecheck`.
- `packages/cli/src/index.ts` owns the terminal-native command registration and connects core with agent-pack. Keep CLI output compatible with `okfh --json` and do not add MCP-first behavior here. Keep rendering, option parsing, and error normalization in dedicated CLI modules when they grow beyond command wiring. Verify with `pnpm test packages/cli/test` and `pnpm typecheck`.
- `packages/cli/test`: owns CLI command contract coverage. Keep shared temp-workspace and JSON helpers in `packages/cli/test/helpers.ts`; split command-domain tests instead of growing one catch-all file. Verify with `pnpm test packages/cli/test`.
- `pnpm-lock.yaml` owns dependency resolution state only. Do not hand-edit it; update it through pnpm when package manifests change, then verify with `pnpm install --frozen-lockfile` or the normal CI command set.

## Agent skills

Engineering workflow skills share repo-local setup through `docs/agents/` so issue, triage, and domain assumptions stay versioned with the project.

### Issue tracker

Use local markdown under `.scratch/` for issues and PRDs while the project remains local. Switch this config to GitHub Issues after the repo is pushed and GitHub becomes the tracker. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage state strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context domain documentation layout. See `docs/agents/domain.md`.

## Working Rules

- Before editing, check the current tree with `git status --short`.
- Keep changes scoped to the active phase or the user's explicit request.
- Do not auto-commit, tag, push, publish, or create releases unless the user explicitly asks in the current turn.
- Do not store API keys, tokens, or credentials in tracked files.
- Do not edit generated raw source files in OKF Harness workspaces. `raw/sources/` is immutable by design.
- For source ingestion behavior, copy source files and record hashes; never move or rewrite the user's originals.
- For write-capable CLI behavior, support dry-run or a pending action before overwriting files.

## Verification

- Until Phase 0 creates `package.json` and the pnpm toolchain, there is no project-level executable verifier.
- After Phase 0 exists, the default checks are:

```bash
pnpm test
pnpm typecheck
```

- After workspace/wiki edits, run:

```bash
okfh lint --workspace <workspace> --json
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
