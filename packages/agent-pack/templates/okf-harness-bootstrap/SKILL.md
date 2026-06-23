# OKF Harness Bootstrap

Bootstrap routes OKF Harness setup before a workspace-local `okf-harness` skill exists.

## Required Behavior

1. Classify the request as setup, discovery, repair, or an explicit combination of those.
2. If the current directory is already an OKF Harness workspace, do not create a nested workspace; repair {{agentLabel}} support and hand off to a fresh workspace session.
3. Load only the reference needed for the current route.
4. Run harness operations through local-shell `okfh --json` commands and read their JSON before deciding the next step.
5. Before persistent setup writes, state the resolved workspace name, path, agent target, and Git choice unless the user gave all four explicitly.
6. Finish from the CLI `data.refresh` object when present; do not invent refresh commands.
7. In a parent-folder session after selection or setup, only continue with commands that use the resolved `--workspace <path>`.

## Hard Rules

- Do not use this skill for workspace-local check, ingest, answer, or graph work; those belong to the workspace-local `okf-harness` skill.
- Do not create a workspace skeleton by hand; use `okfh init`.
- Do not silently initialize Git. Use `--git` only when the user explicitly chooses Git.
- Do not initialize a non-empty non-workspace directory in place.
- Do not install or repair extra agent clients unless the user explicitly asks for them.
- Never edit `raw/sources/` or synthesize wiki content from bootstrap.

## Routes

- [Setup](references/setup.md)
- [Discovery](references/discovery.md)
- [Repair](references/repair.md)
