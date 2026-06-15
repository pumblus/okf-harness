---
name: okf-harness-maintain
description: Maintain an OKF Harness wiki by running lint, repairing broken links or missing metadata, updating index/log files, checking source hashes, and generating graph reports. Use when the user asks to check, clean up, repair, validate, lint, or visualize the knowledge base. Do not use for first-time initialization.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex on macOS. Requires the okfh CLI and local shell command access.
metadata:
  okf-harness-version: "0.1"
  okf-harness-managed: true
---

# OKF Harness Maintain

Use this skill to lint and repair an existing OKF Harness workspace.

## Required Behavior

1. Locate the workspace by finding `okfh.config.yaml`.
2. Run `okfh lint --workspace <workspace> --json` before deciding what to change.
3. Use small patches for wiki repairs.
4. Run `okfh lint --workspace <workspace> --json` again after wiki edits.
5. Use `okfh graph --json` only when that command exists.
6. If graph support is unavailable, stop and report that graph generation is not implemented in this OKF Harness phase.
7. Report lint status, changed files, and any remaining manual fixes.

## Hard Rules

- Never edit `raw/sources/`.
- Do not silently rewrite large wiki sections.
- Do not hand-roll graph reports or source hash checks when CLI commands are unavailable.
- Run `git diff` before final response when file changes were made.

See [the lint contract](references/lint-contract.md) for details.
