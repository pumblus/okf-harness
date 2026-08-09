# Contributing To OKF Harness

English | [中文](docs/zh-CN/CONTRIBUTING.md)

Thanks for taking the time to improve OKF Harness. The project is still small, so the best contributions are narrow, testable, and aligned with the current local agent-first scope.

Use the GitHub issue templates for bug reports, feature discussions, and security report coordination.

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
- Obsidian helpers
- GUI or desktop app work
- cloud sync, accounts, or background daemons
- vector search, embeddings, or RAG
- web fetching, source connectors, or crawling

Direct PRs that bypass roadmap discussion for cloud accounts, background crawling, automatic raw source edits, alternate default tool channels, or non-JSON agent contracts will be closed or redirected.

## Local Setup

Requirements:

- macOS, Windows, or Linux
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

- Keep runtime changes inside the current public scope or an accepted issue.
- Keep `@okf-harness/core` independent from CLI, agent-pack, and other higher-level packages.
- Keep `@okf-harness/cli` as the bridge between core and agent-pack behavior.
- Follow the guardrails in [docs/agents/guardrails.md](docs/agents/guardrails.md).

## Tests

Use the smallest verifier that proves your change. The full agent verify loop is in [docs/agents/verify.md](docs/agents/verify.md):

```bash
pnpm test
pnpm typecheck
pnpm lint
```

`pnpm lint` (Biome plus the llms docs freshness check) must pass before a PR; CI runs it on every PR.

For CLI behavior changes, also build and exercise the built binary:

```bash
pnpm build
node packages/cli/dist/main.js check --workspace <workspace> --json
```

For workspace or wiki changes, run the same `okfh check` treatment against that workspace.

Before release follow-through, also run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:tarball
```

## Documentation

README should stay user-facing and short. Put command references in [docs/CLI.md](docs/CLI.md), user workflows in [docs/WORKFLOWS.md](docs/WORKFLOWS.md), product roadmap ideas in [docs/ROADMAP.md](docs/ROADMAP.md), website-only roadmap ideas in [docs/website/ROADMAP.md](docs/website/ROADMAP.md), glossary terms in [CONTEXT.md](CONTEXT.md), and architecture decisions in [docs/adr](docs/adr).

Docs should explain what a normal Claude Code or Codex user should do before explaining the internal package structure.

## Pull Request Checklist

Before opening a PR:

- run the relevant tests
- update docs for user-visible behavior changes
- follow the guardrails in [docs/agents/guardrails.md](docs/agents/guardrails.md)
- avoid unrelated formatting churn
- mention any checks you could not run
