# OKF Harness workspace

<!-- OKF Harness: start -->
This repository is an OKF Harness workspace.

Use the project skills for user-facing workflows:

- `/okf-harness-init` for first-time setup and adapter repair.
- `/okf-harness-ingest` for adding or compiling sources.
- `/okf-harness-query` for answering from the wiki.
- `/okf-harness-maintain` for lint, repair, and graph reports.

Rules:

- `raw/sources/` is immutable. Never edit source files.
- `wiki/` is the OKF bundle and may be edited by the agent.
- Use `okfh --json` through the local shell for deterministic harness operations.
- Desktop App and TUI sessions use the same local shell command workflow.
- If `okfh` or shell access fails, run `okfh doctor --json` when possible and report the failed checks.
- Run `okfh lint --workspace <workspace> --json` after modifying wiki files.
- Run `git diff` before final response after any file changes.
<!-- OKF Harness: end -->
