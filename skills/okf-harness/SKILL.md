---
name: okf-harness
description: Unified OKF Harness entrypoint for Hermes Agent. Use when the user asks to create, find, select, repair, check, ingest into, reconcile, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, repository maintenance, repository dependency graphs, or non-OKF knowledge-base work.
license: Apache-2.0
metadata:
  hermes:
    tags: [okf, knowledge-management]
  okf-harness-managed: "true"
  okf-harness-entrypoint: "host"
  okf-harness-install-id: "pumblus/okf-harness/okf-harness"
---

# OKF Harness

Route setup and workspace maintenance through this host entrypoint.

## Runtime Route

Start by invoking the launcher and reading its machine-readable result:

```bash
npx @okf-harness/setup@latest launch -- status --json
```

- `WORKSPACE_NOT_FOUND`: discover a workspace in the current folder, a user-named folder, or immediate children of `Documents/OKF Harness`; otherwise create one with the command below.
- `RUNTIME_PIN_MISSING`: run `data.adoptCommand` exactly, then retry.
- `CONFIG_INVALID` or runtime execution failure: stop with the reported problem.
- Resolved workspace: pass every runtime operation through the launcher with `--workspace <workspace>`.

Create a workspace without adding unsupported workspace-local guidance:

```bash
npx --yes --package @okf-harness/cli@0.6.0 okfh init <workspace> --name <name> --agents none --json
```

## Workspace Routes

```bash
npx @okf-harness/setup@latest launch --workspace <workspace> -- status --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- check --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- source add <source> --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- ingest plan <source-id> --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- source list --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- source reconcile <prior-source-id> <revision-source-id> --note "<judgment-note>" --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- evidence "<question>" --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- read <concept-id-or-path> --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- graph --json
```

## Completion Contract

- Setup finishes with the resolved workspace path and a successful launcher status.
- Check reports the status and first concrete next step.
- Ingest reports the source ID, changed wiki paths, and final check status.
- Reconciliation finishes only after the exact revision edge is acknowledged.
- Answer cites concept paths and source IDs and states material evidence limits.
- Graph reports the generated HTML and backlinks paths.

## Boundaries

- This host skill supports daily operations but does not install workspace-local guidance. Do not claim otherwise.
- Before writes, confirm the workspace path. Never initialize a non-empty non-workspace directory.
- Never edit `raw/sources/`; register corrected material as a new source.
- Ingest plans do not synthesize wiki content. After bounded wiki edits, run check and name changed files.
- Normal answers use synthesized `wiki/` evidence and at most one continuation-cue read, not raw source bodies.
- Never invent source IDs, citations, command output, or an `okfh query` command.
