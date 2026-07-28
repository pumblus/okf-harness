# Repair

## Intent

Install or repair Codex workspace-local guidance for a selected OKF Harness workspace.

## Preconditions

- The target path must already be an initialized OKF Harness workspace.
- Repair only Codex unless the user explicitly asks for another agent.
- If this skill was invoked from inside the selected workspace, do not run setup; repair Codex workspace-local guidance and continue through `$okf-harness`.
- If a selected workspace already has current Codex guidance, report the path and refresh guidance instead of reinstalling extra clients.

## Allowed Commands

```bash
npx @okf-harness/setup@latest launch --workspace <workspace> -- agent install codex --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- status --json
```

## Allowed Writes

- Managed Codex workspace guidance under the selected workspace.
- Managed backups that the runtime's `agent install` operation creates for retired workflow skills.

## Completion Condition

Report the repair result and the CLI `data.refresh` message. If `data.refresh.commands` exists, show the two command lines exactly. Continue through `$okf-harness`; mention a fresh Codex thread only when the returned refresh guidance asks for one.
