---
name: okf-harness-bootstrap
description: Bootstrap OKF Harness before a workspace exists. Use when the user asks to create, find, select, repair, or enter an OKF Harness workspace from Claude Code. Do not use for workspace-local check, ingest, answer, graph, generic Markdown editing, repository maintenance, or non-OKF knowledge-base work.
license: Apache-2.0
compatibility: Designed for Claude Code with local shell command access. Requires the okfh CLI.
metadata:
  okf-harness-version: "0.5.5"
  okf-harness-managed: "true"
  okf-harness-entrypoint: "bootstrap"
  okf-harness-agent: "claude"
---

# OKF Harness Bootstrap

Bootstrap routes OKF Harness setup before a workspace-local `okf-harness` skill exists.

## Required Behavior

1. Classify the request as setup, discovery, repair, or an explicit combination of those.
2. If the current directory is already an OKF Harness workspace, do not create a nested workspace; repair Claude Code support and hand off to a fresh workspace session.
3. Load only the reference needed for the current route.
4. If `okfh` is missing, stop and tell the user to run `npm install -g @okf-harness/cli`, then `okfh doctor --json`; do not create workspaces or edit files until runtime setup is fixed.
5. Run harness operations through local-shell `okfh --json` commands and read their JSON before deciding the next step.
6. Before persistent setup writes, state the resolved workspace name, path, agent target, and Git choice unless the user gave all four explicitly.
7. Finish from the CLI `data.refresh` object when present; do not invent refresh commands.
8. In a parent-folder session after selection or setup, only continue with commands that use the resolved `--workspace <path>`.
9. Treat setup-plus-source requests as a transitional path: resolve or create the workspace, register sources, prepare ingest plans, then stop with a fresh-session handoff.

## Hard Rules

- Do not use this skill for workspace-local check, ingest, answer, or graph work; those belong to the workspace-local `okf-harness` skill.
- Do not create a workspace skeleton by hand; use `okfh init`.
- Do not silently initialize Git. Use `--git` only when the user explicitly chooses Git.
- Do not initialize a non-empty non-workspace directory in place.
- Do not install or repair extra agent clients unless the user explicitly asks for them.
- Never edit `raw/sources/` by hand; source registration must use `okfh source add`.
- Never synthesize wiki content, run `okfh check`, prepare evidence, or answer from bootstrap.

## Transitional Setup-Plus-Source

- Route references cover workspace resolution or repair; setup-plus-source then additionally uses the registration and ingest-planning commands below before final handoff.
- Classify requested sources as local paths or URLs before setup. Validate every required local source path with metadata/readability checks before `okfh init`; missing, non-file, or unreadable local inputs stop setup. Report all invalid local inputs before creating or selecting the workspace.
- URL sources are accepted as source pointers only. Do not fetch, scrape, summarize, or imply webpage content was captured in bootstrap.
- After setup or workspace selection, register each accepted source and prepare an ingest plan from the returned `data.source.id` with deterministic CLI JSON:

```bash
okfh source add <source> --workspace <workspace> --json
okfh ingest plan <source-id> --workspace <workspace> --json
```

- If local source validation, source registration, or ingest planning fails, report that step as the first-loop blocker with one concrete next action, then stop before wiki edits.
- Completion criterion: every accepted source has a successful registration result, a successful ingest plan, and a fresh-session handoff. Do not read raw source bodies or write `wiki/` content.
- Hand off wiki synthesis to `/okf-harness` in a fresh workspace-local Claude Code session.

## Routes

- [Setup](references/setup.md)
- [Discovery](references/discovery.md)
- [Repair](references/repair.md)
