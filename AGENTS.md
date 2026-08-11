# OKF Harness

An agent-first, local-first, terminal-native harness for maintaining OKF-compatible LLM Wikis through coding agents. The unified agent entrypoint is `okf-harness`; the CLI alias is `okfh`.

## Toolchain

- pnpm 11 (not npm), Node >= 22. Scripts: `pnpm -w run test`, `pnpm -w run typecheck`, `pnpm -w run lint`, `pnpm -w run build` (`-w` targets the workspace root from any directory). Lint is Biome plus the llms docs freshness check.
- Layering rule: `packages/core` imports nothing from other packages; `packages/cli` is the bridge between core and agent-pack.

## Repo layout

- `packages/core` — harness logic; `packages/cli` — `okfh` command surface, `--json` everywhere; `packages/agent-pack` — agent guidance renderers and skill templates; `packages/setup` — universal setup; `packages/native-integration` — host installers.
- `skills/okf-harness` — the unified host entrypoint skill.
- `examples/` — dogfood workspaces whose `raw/sources/` are immutable fixtures.
- `docs/`, `site/`, `CONTEXT.md` — product docs, website sources, glossary.

## Read before you act

- Before finishing a change: run the [verify loop](docs/agents/verify.md).
- Before writing user-facing text, running or documenting `okfh` commands, or changing cross-package behavior: read [read-before-write](docs/agents/read-before-write.md).
- Before opening a PR: read [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [guardrails](docs/agents/guardrails.md).
