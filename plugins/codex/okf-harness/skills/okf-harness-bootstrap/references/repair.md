# Repair

## Intent

Install or repair Codex workspace-local guidance for a selected OKF Harness workspace.

## Preconditions

- The target path must already be an initialized OKF Harness workspace.
- Repair only Codex unless the user explicitly asks for another agent.
- If bootstrap was invoked from inside the selected workspace, do not run setup; repair Codex workspace-local guidance and redirect the user to `$okf-harness`.
- If a selected workspace already has current Codex guidance, report the path and refresh guidance instead of reinstalling extra clients.

## Allowed Commands

```bash
okfh agent install codex --workspace <workspace> --json
okfh status --workspace <workspace> --json
```

## Allowed Writes

- Managed Codex workspace guidance under the selected workspace.
- Managed backups that `okfh agent install` creates for retired workflow skills.

## Completion Condition

Report the repair result and the `data.refresh` message from the CLI. If `data.refresh.commands` exists, show the two command lines exactly; otherwise repeat the natural-language refresh message so the user opens a fresh Codex thread from the workspace folder with `$okf-harness` loaded.
