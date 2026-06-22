# Setup

## Intent

Create the first OKF Harness workspace for Codex from a parent folder.

## Preconditions

- Resolve a display name and target path from the user's request, or ask for the missing value.
- Confirm Git only when the user explicitly wants it; the default and recommended answer is no.
- Refuse a non-empty target directory unless `okfh status --workspace <path> --json` shows it is already an OKF Harness workspace.

## Allowed Commands

```bash
okfh init <workspace> --name <name> --agents codex --json
okfh init <workspace> --name <name> --agents codex --git --json
okfh status --workspace <workspace> --json
```

## Allowed Writes

- A new OKF Harness workspace at the confirmed target path.
- Codex workspace-local guidance created by `okfh init --agents codex`.

## Completion Condition

Report the workspace path, whether Git was initialized, and that the user should open a fresh Codex thread from the workspace folder before using `$okf-harness`.
