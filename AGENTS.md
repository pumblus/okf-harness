# OKF Harness

An agent-first, local-first, terminal-native harness for maintaining OKF-compatible LLM Wikis through coding agents. People keep one local workspace per knowledge domain; agents register raw sources, synthesize `wiki/*.md` concept documents with citations, and answer from evidence briefs. The unified agent entrypoint is `okf-harness`; the CLI alias is `okfh`.

## Repo layout

- `packages/core` — harness logic. Layering rule: core imports nothing from other packages; `packages/cli` is the bridge between core and agent-pack.
- `packages/cli` — the `okfh` command surface, `--json` everywhere.
- `packages/agent-pack` — agent guidance renderers and skill templates; `packages/setup` — universal setup; `packages/native-integration` — host installers.
- `skills/okf-harness` — the unified host entrypoint skill.
- `examples/` — dogfood workspaces whose `raw/sources/` are immutable fixtures.
- `docs/`, `site/`, `CONTEXT.md` — product docs, website sources, glossary.

## Verify loop

For each change, in order:

1. `pnpm test` — add or update a test that proves the change.
2. `pnpm typecheck` — clean.
3. `pnpm lint` — clean (Biome plus the llms docs freshness check); it must pass before a PR.
4. CLI behavior changes: `pnpm build`, then exercise the built binary, e.g. `node packages/cli/dist/main.js check --workspace <ws> --json`. Workspace or wiki changes get the same `okfh check` treatment against that workspace.

Completion: the change is proven by a passing test, `pnpm typecheck` and `pnpm lint` are clean, and any CLI change is demonstrated against the built binary.

## Read before writing

- **Product language** — `CONTEXT.md` defines every product term with an _Avoid_ list. Read it before writing any user-facing text (docs, README, issues, prompts, skill content) and use its words, never its avoid words.
- **CLI contract** — `docs/CLI.md` documents every command and its JSON shape. Read before running or documenting `okfh` commands; the JSON shapes are agent contracts.
- **Workflows** — `docs/WORKFLOWS.md` shows the end-to-end user journeys (first useful loop, ingest, reconcile, answer, graph). Read when a change touches how people or agents use the harness.
- **Decisions and direction** — `docs/adr/` ADRs bind cross-package and user-visible design; `docs/ROADMAP.md` scopes new directions. Read both before changing cross-package behavior or proposing new features.
- **Contribution rules** — `CONTRIBUTING.md` lists scope and PR rules. Read before opening a PR.

## Guardrails

- Keep credentials, tokens, and private absolute paths out of tracked files.
- Keep `examples/*/raw/sources/` and fixture raw sources untouched; register a new raw source instead of editing a registered one.
- Keep agent guidance (entrypoint, skills, adapters in `packages/agent-pack` and `skills/`) in sync with the CLI behavior it describes.
- Keep each PR scoped to one problem, with JSON command examples for any CLI change.
- Leave version bumps, publishing, tagging, and releases to release work.
