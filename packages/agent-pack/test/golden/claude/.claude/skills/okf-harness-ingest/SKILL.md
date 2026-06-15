---
name: okf-harness-ingest
description: Add source material and compile it into an OKF-compatible LLM Wiki by creating reference pages, updating topic/entity/project pages, citations, index, and log. Use when the user asks to add, ingest, absorb, summarize into the wiki, or organize a new source. Do not use for general question answering without new sources.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex on macOS. Requires the okfh CLI and local shell command access.
metadata:
  okf-harness-version: "0.1"
  okf-harness-managed: true
---

# OKF Harness Ingest

Use this skill to register source material and compile it into the local OKF wiki.

## Required Behavior

1. Locate the workspace by finding `okfh.config.yaml`.
2. Use the local shell to run `okfh --json` commands.
3. Try `okfh source add <path-or-url> --json` only when that command exists.
4. Try `okfh ingest plan <source-id-or-path> --json` only when that command exists.
5. If source or ingest commands are unavailable, stop and report that source ingest is not implemented in this OKF Harness phase.
6. After supported ingest work changes wiki files, run `okfh lint --json`.
7. Show the user changed files, lint status, and unresolved questions.

## Hard Rules

- Never edit `raw/sources/`.
- Never invent source IDs, citations, dates, or claims.
- Do not hand-roll a source manifest, search index, graph, or raw source management.
- If more than 20 wiki files seem affected, stop after an ingest plan and ask the user to narrow scope.
- Run `git diff` before final response when file changes were made.

See [the ingest contract](references/ingest-contract.md) for details.
