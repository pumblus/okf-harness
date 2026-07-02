---
name: okf-harness-bootstrap
description: Bootstrap OKF Harness from Pi or OpenCode before a workspace-local OKF skill exists. Use when the user asks to create, find, select, repair, or enter an OKF Harness workspace. If okfh is missing, point to the README runtime install command. Do not use for daily workspace answers, generic Markdown editing, or non-OKF knowledge-base work.
license: Apache-2.0
compatibility: pi, opencode
metadata:
  okf-harness-managed: "true"
  okf-harness-entrypoint: "bootstrap"
  okf-harness-package: "@pumblus/okf-harness"
---

# OKF Harness Bootstrap

Use this skill only as the global bootstrap entrypoint for OKF Harness.

## Runtime Check

1. Check whether `okfh` is available before planning workspace actions.
2. If `okfh` is missing, stop and tell the user to install the runtime with the OKF Harness README command: `npm install -g @okf-harness/cli`.
3. Do not install, update, or replace the runtime from this skill.

## Scope

- This package exposes only `okf-harness-bootstrap`.
- Do not claim that Pi or OpenCode workspace-local daily adapters are installed by this package.
- Once `okfh` is available, use the runtime CLI to inspect, create, select, or repair OKF Harness workspaces.
- Before changing a workspace, prefer JSON-capable checks such as `okfh doctor --json` and workspace status commands when available.

## Response Contract

- State the runtime status first.
- If blocked by a missing runtime, give only the exact README install command: `npm install -g @okf-harness/cli`.
- If continuing, keep actions limited to OKF Harness bootstrap work.
