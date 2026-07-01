# Discovery

## Intent

Find or select an existing OKF Harness workspace before workspace-local guidance is available.

## Preconditions

- Treat the current directory as a possible workspace first.
- Use `okfh status --json` to detect whether the current directory is inside an initialized workspace.
- If the current directory is inside an initialized workspace, select the reported workspace and redirect to `/okf-harness` or the repair route; never create a nested workspace.
- Keep discovery bounded to the current folder, a user-named parent folder, or the default `Documents/OKF Harness` parent folder.
- Inspect only the search root and its immediate child directories unless the user names a deeper path.
- Skip obvious heavy or internal directories such as `.git`, `.okfh`, `node_modules`, `dist`, `build`, `coverage`, caches, and `raw`.
- Verify each candidate with `okfh status --workspace <workspace> --json`; do not trust folder names alone.
- If zero workspaces are discovered, enter setup.
- If one workspace is discovered, select it and report the resolved path.
- If multiple workspaces match and the user's request is ambiguous, ask the user to choose.

## Allowed Commands

Filesystem listing of the bounded search roots is allowed before verification.

```bash
okfh status --json
okfh status --workspace <workspace> --json
```

## Allowed Writes

None. Discovery is read-only.

## Completion Condition

Report the selected workspace path, then hand off to repair when Claude Code workspace-local guidance is missing or stale.
