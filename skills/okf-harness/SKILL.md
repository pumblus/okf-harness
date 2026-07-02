---
name: okf-harness-bootstrap
description: Bootstrap OKF Harness from Hermes Agent before a workspace-local OKF skill exists. Use when the user asks Hermes to create, find, select, repair, or enter an OKF Harness workspace. If okfh is missing, point to Universal setup. Do not use for daily workspace answers, generic Markdown editing, or non-OKF knowledge-base work.
license: Apache-2.0
metadata:
  hermes:
    tags: [okf, bootstrap, knowledge-management]
  okf-harness-managed: "true"
  okf-harness-entrypoint: "bootstrap"
  okf-harness-install-id: "pumblus/okf-harness/okf-harness"
---

# OKF Harness Bootstrap

Use this skill only as the Hermes global bootstrap entrypoint for OKF Harness.

## Runtime Check

1. Check whether `okfh` is available before planning workspace actions.
2. If `okfh` is missing, stop and tell the user to run `npx @okf-harness/setup@latest`.
3. Do not install, update, or replace the runtime from this skill.

## Scope

- Hermes installs this skill as `pumblus/okf-harness/okf-harness`, but it exposes only `okf-harness-bootstrap`.
- Do not claim that a Hermes workspace-local daily adapter is installed by this skill.
- Once `okfh` is available, use `okfh --json` commands to inspect, create, select, or repair OKF Harness workspaces.
- Before changing a workspace, prefer JSON-capable checks such as `okfh doctor --json` and workspace status commands when available.

## Response Contract

- State the runtime status first.
- If blocked by a missing runtime, give only the exact setup command: `npx @okf-harness/setup@latest`.
- If continuing, keep actions limited to OKF Harness bootstrap work.
