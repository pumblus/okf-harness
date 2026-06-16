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
2. Run `okfh status --json` and confirm `data.capabilities.search`, `read`, and `graph` are available while `queryCommand` is not available.
3. Run `okfh read index --json` first to inspect the wiki map.
4. Run `okfh search <question> --json` to get candidate concept cards.
5. Run `okfh read <concept-id-or-path> --json` for relevant candidates before synthesizing.
6. Follow useful reference citations with `okfh read <reference-concept-id-or-path> --json` when factual precision matters.
7. If a read is truncated, continue with `--section`, `--section-id`, `--offset/--limit`, or `--full` before relying on omitted content.
8. Answer directly first, then list supporting concept paths and available source IDs.
9. If hits are weak, citations are missing, or only wiki synthesis was read, state the evidence limit plainly.

## Hard Rules

- Do not ingest new source material from this skill.
- Do not invent citations or claim the wiki says something without reading it.
- Do not run or hallucinate an `okfh query` command.
- Do not build an ad hoc search index or search `raw/sources/` for normal query answers.
- Do not edit `raw/sources/`.

See [the answer contract](references/answer-contract.md) for details.
