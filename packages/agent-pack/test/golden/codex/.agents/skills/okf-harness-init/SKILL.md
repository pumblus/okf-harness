---
name: okf-harness-init
description: Initialize and organize an OKF Harness workspace on macOS, including folders, git, OKF bundle files, and Claude/Codex adapters. Use when the user asks to set up, create, initialize, organize, or install OKF Harness support. Do not use for ingesting an already-added source.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex on macOS. Requires the okfh CLI and local shell command access.
metadata:
  okf-harness-version: "0.1"
  okf-harness-managed: true
---

# OKF Harness Init

Use this skill to create a workspace or repair Claude/Codex adapter support.

## Required Behavior

1. Locate or choose the workspace path with the user.
2. Use the local shell to run `okfh init <workspace> --name <name> --agents all --json` for first-time setup.
3. Use `okfh agent install all --workspace <workspace> --json` to repair adapter files in an existing workspace.
4. If the CLI or local shell is unavailable, run `okfh doctor --json` when possible; otherwise stop and tell the user to install OKF Harness instead of hand-writing the workspace structure.
5. After initialization, run `okfh status --workspace <workspace> --json` and report the workspace path, lint status, warnings, and next step.

## Hard Rules

- Do not create a parallel workspace skeleton by hand.
- Do not overwrite a non-empty directory unless `okfh` returns an explicit safe plan.
- Do not add plugin, hook, Pi, OpenCode, or Obsidian setup.
- Use the same local shell `okfh --json` workflow in Desktop App and TUI sessions.
- Run `git diff` before final response when file changes were made.

See [the init workflow](references/workflow.md) for details.
