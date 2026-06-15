# OKF Harness workspace

<!-- OKF Harness: start -->
This repository is an OKF Harness workspace.

Use repo skills for workflows:

- `$okf-harness-init` for first-time setup and adapter repair.
- `$okf-harness-ingest` for adding or compiling sources.
- `$okf-harness-query` for answering from the wiki.
- `$okf-harness-maintain` for lint, repair, and graph reports.

Rules:

- `raw/sources/` is immutable. Never edit source files.
- `wiki/` is the OKF bundle and may be edited by the agent.
- Use `okfh --json` through the local shell for deterministic harness operations.
- Run `okfh lint --workspace <workspace> --json` after modifying wiki files.
- Run `git diff` before final response after any file changes.
<!-- OKF Harness: end -->
