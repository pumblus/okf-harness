# OKF Harness workspace

<!-- OKF Harness: start -->
This repository is an OKF Harness workspace.

Use repo skills for workflows:

- `$okf-harness` for setup, check, ingest, answer, and graph workflows.

Rules:

- `raw/sources/` is immutable. Never edit source files.
- `wiki/` is the OKF bundle and may be edited by the agent.
- Use `okfh --json` through the local shell for deterministic harness operations.
- Desktop App and TUI sessions use the same local shell command workflow.
- If `okfh` or shell access fails, run `okfh doctor --json` when possible and report the failed checks.
- Run `okfh check --workspace <workspace> --json` after modifying wiki files.
- Run `git diff` before final response after any file changes.
<!-- OKF Harness: end -->
