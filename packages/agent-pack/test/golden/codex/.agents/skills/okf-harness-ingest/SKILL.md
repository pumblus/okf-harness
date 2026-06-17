---
name: okf-harness-ingest
description: Add source material and compile it into an OKF-compatible LLM Wiki by creating reference pages, updating topic/entity/project pages, citations, index, and log. Use when the user asks to add, ingest, absorb, summarize into the wiki, or organize a new source. Do not use for general question answering without new sources.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex with local shell command access. Requires the okfh CLI.
metadata:
  okf-harness-version: "0.2"
  okf-harness-managed: true
---

# OKF Harness Ingest

Use this skill to register source material and compile it into the local OKF wiki.

## Required Behavior

1. Locate the workspace by finding `okfh.config.yaml`.
2. Use the local shell to run `okfh --json` commands.
3. If the source is not registered, run `okfh source add <path-or-url> --workspace <workspace> --json`.
4. Run `okfh ingest plan <source-id-or-path> --workspace <workspace> --json` before editing wiki files.
5. Treat candidate concepts as metadata hints only; read the full source before semantic analysis.
6. After ingest work changes wiki files, run `okfh lint --workspace <workspace> --json`.
7. Show the user changed files, lint status, and unresolved questions.

## Hard Rules

- Never edit `raw/sources/`.
- Never invent source IDs, citations, dates, or claims.
- Do not hand-roll a source manifest, search index, graph, or raw source management.
- If more than 20 wiki files seem affected, stop after an ingest plan and ask the user to narrow scope.
- Run `git diff` before final response when file changes were made.

See [the ingest contract](references/ingest-contract.md) for details.
