# Discovery

## Intent

Find or select an existing OKF Harness workspace before workspace-local guidance is available.

## Preconditions

- Treat the current directory as a possible workspace first.
- Keep discovery shallow and local to the current folder or a user-named parent folder.
- If multiple workspaces match and the user's request is ambiguous, ask the user to choose.

## Allowed Commands

```bash
okfh status --workspace <workspace> --json
```

## Allowed Writes

None. Discovery is read-only.

## Completion Condition

Report the selected workspace path, then hand off to repair when {{agentLabel}} workspace-local guidance is missing or stale.
