---
name: okf-harness
description: Unified OKF Harness entrypoint. Use when the user asks to create, find, select, repair, check, ingest into, reconcile, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, repository maintenance, repository dependency graphs, or non-OKF knowledge-base work.
license: Apache-2.0
compatibility: Designed for any client that loads Agent Skills and can run local shell commands with npx access. The Harness runtime is resolved through the launcher.
metadata:
  okf-harness-version: "0.8.1"
  okf-harness-managed: "true"
  okf-harness-entrypoint: "host"
  okf-harness-distribution: "portable"
---

# OKF Harness

This unified entrypoint routes setup and workspace maintenance without making the user choose a mode.

## Required Behavior

1. Classify the request as setup, discovery, repair, check, ingest, reconciliation, answer, graph, or an explicit combination.
2. Resolve the workspace with the launcher before choosing the route:

```bash
npx @okf-harness/setup@latest launch -- status --json
```

3. Read the launcher's machine-readable result. `WORKSPACE_NOT_FOUND` routes to discovery or setup. `RUNTIME_PIN_MISSING` means run `data.adoptCommand` exactly and retry. `CONFIG_INVALID` and runtime execution failures stop the workflow with the reported problem.
4. For a resolved workspace, run every Harness command through `npx @okf-harness/setup@latest launch --workspace <workspace> -- <runtime-arguments>` and read its JSON before continuing.
5. Load only the setup, discovery, or repair reference when that route needs it. Daily workspace routes use the commands below.
6. Before persistent setup writes, state the resolved workspace name, path, and agent target unless the user supplied all three.
7. After any wiki edit, run the workspace check and report its status. If files changed, name the changed files.
8. Use the CLI `data.refresh` object when present without claiming that workspace-local guidance exists unless the result confirms it.

## Workspace Routes

```bash
npx @okf-harness/setup@latest launch --workspace <workspace> -- check --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- source add <source> --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- ingest plan <source-id> --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- source list --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- source reconcile <prior-source-id> <revision-source-id> --note "<judgment-note>" --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- evidence "<question>" --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- read <concept-id-or-path> --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- graph --json
```

- Ingest registers source material, prepares the plan, then lets the agent read the registered source and make bounded wiki edits; the CLI does not synthesize wiki content.
- Reconciliation reads both immutable registered revisions, updates every affected wiki claim, checks the workspace, then records the exact revision edge.
- Answers use synthesized `wiki/` evidence from `evidence`, plus at most one continuation-cue `read`. Normal answers do not read raw source bodies.
- Graph uses `--open` only when the user asks to open the report.

## Setup-Plus-Source

- Validate every requested local source before creating a workspace. Report every missing, non-file, or unreadable input before writing.
- Treat URLs as source pointers; do not fetch or imply their contents were captured.
- After setup or selection, register each accepted source and prepare its ingest plan through the launcher. Continue into wiki synthesis only when the user requested it and the current session can safely edit the resolved workspace.
- On failure, report the first-loop blocker with one concrete next action.

## Completion Contract

- Setup, discovery, and repair finish only when the selected reference's completion condition is met.
- Check reports status, conformance, Harness findings, and the first concrete next step.
- Ingest reports the source ID, changed wiki paths, check status, and unresolved questions.
- Reconciliation finishes only after the exact prior-and-revision edge is acknowledged.
- Answer cites supporting concept paths and source IDs and states material evidence limits.
- Graph reports the generated HTML and backlinks paths.

## Hard Rules

- Do not create a workspace skeleton by hand; use the setup route's runtime command.
- Do not initialize a non-empty non-workspace directory in place.
- Do not install or repair extra agent clients unless the user explicitly asks.
- Never edit `raw/sources/`; register corrected material as a new source.
- Never invent source IDs, citations, dates, claims, command output, or an `okfh query` command.
- Keep knowledge-base work outside OKF Harness and repository dependency graphs out of this skill.

## Routes

- [Setup](references/setup.md)
- [Discovery](references/discovery.md)
- [Repair](references/repair.md)
