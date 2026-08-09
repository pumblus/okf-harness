# Read before writing

Each item names the material and the branch that triggers reading it:

- **Product language** — `CONTEXT.md` defines every product term with an _Avoid_ list. Read it before writing any user-facing text (docs, README, issues, prompts, skill content) and use its words, never its avoid words.
- **CLI contract** — `docs/CLI.md` documents every command and its JSON shape. Read before running or documenting `okfh` commands; the JSON shapes are agent contracts.
- **Workflows** — `docs/WORKFLOWS.md` shows the end-to-end user journeys (first useful loop, ingest, reconcile, answer, graph). Read when a change touches how people or agents use the harness.
- **Decisions and direction** — `docs/adr/` ADRs bind cross-package and user-visible design; `docs/ROADMAP.md` scopes new directions. Read both before changing cross-package behavior or proposing new features.
- **Contribution rules** — `CONTRIBUTING.md` lists scope and PR rules. Read before opening a PR.
