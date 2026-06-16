# Contributing To OKF Harness

English | [中文](docs/zh-CN/CONTRIBUTING.md)

Thanks for taking the time to improve OKF Harness. The project is still small, so the best contributions are narrow, testable, and aligned with the v0.1 local agent-first scope.

## Scope

Good first contributions:

- documentation fixes and clearer examples
- focused tests for existing CLI or core behavior
- bug fixes in `okfh --json` command behavior
- improvements to CLI error messages and next steps
- agent guidance fixes for Claude Code or Codex
- small example workspace improvements

Please open an issue or discussion before starting work on:

- new agent adapters
- MCP behavior
- Obsidian helpers
- GUI or desktop app work
- cloud sync, accounts, or background daemons
- vector search, embeddings, or RAG
- web fetching, source connectors, or crawling
- Windows or Linux support

Direct PRs that move v0.1 toward MCP-first behavior, cloud accounts, background crawling, automatic raw source edits, or non-JSON agent contracts will be closed or redirected.

## Local Setup

Requirements:

- macOS
- Node.js 22 or newer
- pnpm 11

Install and verify:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Run the local CLI after building:

```bash
node packages/cli/dist/main.js doctor --json
```

## Development Rules

- Keep runtime changes inside the current phase or an accepted issue.
- Keep `@okf-harness/core` independent from CLI, agent-pack, and MCP packages.
- Keep `@okf-harness/cli` as the bridge between core and agent-pack behavior.
- Keep MCP optional and off the default v0.1 path.
- Do not edit registered files under `raw/sources/` in example or fixture workspaces.
- Do not add credentials, tokens, or private local paths to tracked files.
- Do not bump versions, publish, tag, or create releases in ordinary PRs.

## Tests

Use the smallest verifier that proves your change:

```bash
pnpm test
pnpm typecheck
pnpm build
```

For workspace or wiki changes, also run:

```bash
node packages/cli/dist/main.js lint --workspace <workspace> --json
```

CI also runs `pnpm lint`.

## Documentation

README should stay user-facing and short. Put command references in [docs/CLI.md](docs/CLI.md), user workflows in [docs/WORKFLOWS.md](docs/WORKFLOWS.md), roadmap ideas in [docs/ROADMAP.md](docs/ROADMAP.md), and implementation details in [docs/implementation.md](docs/implementation.md).

Docs should explain what a normal Claude Code or Codex user should do before explaining the internal package structure.

## Pull Request Checklist

Before opening a PR:

- run the relevant tests
- update docs for user-visible behavior changes
- keep changes scoped to one problem
- include JSON command examples when changing CLI behavior
- avoid unrelated formatting churn
- mention any checks you could not run
