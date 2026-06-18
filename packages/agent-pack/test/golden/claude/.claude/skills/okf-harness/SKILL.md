---
name: okf-harness
description: One Door entrypoint for OKF Harness workspaces. Use when the user asks to set up a workspace, check or maintain it, ingest source material, answer from it, or generate its graph. Do not use old workflow-specific skill names or an `okfh query` command.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex with local shell command access. Requires the okfh CLI.
metadata:
  okf-harness-version: "0.2"
  okf-harness-managed: true
---

# OKF Harness

Route the request to the matching internal workflow, load only the needed reference, and finish on that reference's completion check.

## Required Behavior

1. Classify the request into setup, check, ingest, answer, graph, or a user-ordered combination of those workflows.
2. Resolve the workspace by finding `okfh.config.yaml`, except during first-time setup where the workspace path is being created.
3. Run harness operations through local-shell `okfh --json` commands and read their JSON before deciding the next step.
4. Load only the reference needed for the current workflow; for combined requests, load the next reference only when that workflow starts.
5. After any wiki edit, run `okfh check --workspace <workspace> --json` and report the check status before broader cleanup advice.
6. If files changed, run `git diff` and name the changed files before the final response.

## Hard Rules

- Do not expose old workflow-specific skill names to users.
- Do not create a workspace skeleton by hand; use `okfh init`.
- Never edit `raw/sources/`; register corrected material as a new source.
- Never invent source IDs, citations, dates, claims, or command output.
- Do not add plugin, hook, Pi, OpenCode, Obsidian, GUI, MCP, or vector-search setup.

## Internal Workflows

- [Setup Workflow](references/setup.md)
- [Check Workflow](references/check.md)
- [Ingest Workflow](references/ingest.md)
- [Answer Workflow](references/answer.md)
- [Graph Workflow](references/graph.md)
