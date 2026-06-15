---
name: okf-harness-query
description: Answer questions using the local OKF Harness wiki by searching concepts, reading full pages, following citations, and citing concept paths. Use when the user asks what their knowledge base says, asks a research question, or requests synthesis from existing wiki knowledge. Do not use to ingest new source material.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex on macOS. Requires the okfh CLI and local shell command access.
metadata:
  okf-harness-version: "0.1"
  okf-harness-managed: true
---

# OKF Harness Query

Use this skill to answer from existing OKF wiki knowledge.

## Required Behavior

1. Locate the workspace by finding `okfh.config.yaml`.
2. Prefer `okfh search <query> --json` and `okfh read <concept-id> --json` when those commands exist.
3. If search/read commands are unavailable, stop and report that query support is not implemented in this OKF Harness phase.
4. Read full relevant wiki pages before synthesizing.
5. Cite wiki paths or concept IDs in the answer.
6. Keep uncertainty and contradictions visible.

## Hard Rules

- Do not ingest new source material from this skill.
- Do not invent citations or claim the wiki says something without reading it.
- Do not build an ad hoc search index when the CLI command is unavailable.
- Do not edit `raw/sources/`.

See [the answer contract](references/answer-contract.md) for details.
