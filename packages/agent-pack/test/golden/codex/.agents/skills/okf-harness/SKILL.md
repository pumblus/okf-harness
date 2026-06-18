---
name: okf-harness
description: Route OKF Harness workspace workflows for setup, check, ingest, answer, and graph from one agent entrypoint. Use when the user asks to set up, check, ingest, answer from, maintain, or visualize an OKF Harness workspace. Do not use workflow-specific skill names or run an `okfh query` command.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex with local shell command access. Requires the okfh CLI.
metadata:
  okf-harness-version: "0.2"
  okf-harness-managed: true
---

# OKF Harness

Use this skill as the single OKF Harness entrypoint. Route the user's intent internally, then load only the relevant reference file.

## Required Behavior

1. Identify the user intent as setup, check, ingest, answer, or graph.
2. Locate the workspace by finding `okfh.config.yaml` unless the user is setting up a new workspace.
3. Use the local shell to run `okfh --json` commands for deterministic harness operations.
4. Load only the reference file for the selected internal workflow.
5. After wiki edits, run `okfh check --workspace <workspace> --json` and report the check status before broader cleanup advice.
6. Report changed files and run `git diff` before final response when file changes were made.

## Hard Rules

- Do not expose workflow-specific skill names to users.
- Do not create a parallel workspace skeleton by hand.
- Never edit `raw/sources/`.
- Never invent source IDs, citations, dates, or claims.
- Do not run or hallucinate an `okfh query` command.
- Do not add plugin, hook, Pi, OpenCode, Obsidian, GUI, MCP, or vector-search setup.

## Internal Workflows

- [Setup Workflow](references/setup.md)
- [Check Workflow](references/check.md)
- [Ingest Workflow](references/ingest.md)
- [Answer Workflow](references/answer.md)
- [Graph Workflow](references/graph.md)
