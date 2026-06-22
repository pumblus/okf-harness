---
name: okf-harness
description: One Door workflow for OKF Harness workspaces. Use when the user asks to set up, check, ingest into, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, ordinary repository maintenance, knowledge-base tasks outside an OKF Harness workspace, repository dependency graphs, old workflow-specific skill names, or an `okfh query` command.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex with local shell command access. Requires the okfh CLI.
metadata:
  okf-harness-version: "0.4.0"
  okf-harness-managed: "true"
---

# OKF Harness

One Door routes OKF Harness workspace requests to exactly one internal workflow at a time.

## Required Behavior

1. Classify the request into setup, check, ingest, answer, graph, or a user-ordered combination of those workflows.
2. Resolve the workspace by finding `okfh.config.yaml`, except during first-time setup where the workspace path is being created.
3. For combined requests, name the workflow sequence, run one workflow at a time in the user's order, and stop before the next workflow when any `okfh --json` command fails.
4. Run harness operations through local-shell `okfh --json` commands and read their JSON before deciding the next step.
5. Load only the reference needed for the current workflow; for combined requests, load the next reference only when that workflow starts.
6. After any wiki edit, run `okfh check --workspace <workspace> --json` and report the check status before broader cleanup advice.
7. If files changed, run `git diff` and name the changed files before the final response.

## Hard Rules

- Do not use this skill for generic Markdown editing, ordinary repository maintenance, knowledge-base work outside an OKF Harness workspace, or repository dependency graphs.
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
