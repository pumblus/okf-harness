# Repair

## Intent

Install or repair workspace-local guidance for the current agent in a selected OKF Harness workspace.

## Preconditions

- The target path must already be an initialized OKF Harness workspace.
- Set the agent target from **self-report** alone — the client you know yourself to be. Claude Code: repair `claude`. Codex: repair `codex`. Any other client has no managed guidance target: report that, and continue with the daily routes through the launcher.
- Repair the self-reported agent only, and add another agent when the user names it.
- If this skill was invoked from inside the selected workspace, do not run setup; repair the current agent's workspace-local guidance and continue through the okf-harness skill.
- If a selected workspace already has current guidance for the agent target, report the path and refresh guidance instead of reinstalling extra clients.

## Allowed Commands

```bash
npx @okf-harness/setup@latest launch --workspace <workspace> -- agent install <agent-target> --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- status --json
```

## Allowed Writes

- Managed workspace guidance for the agent target under the selected workspace.
- Managed backups that the runtime's `agent install` operation creates for retired workflow skills.

## Completion Condition

Report the repair result and the CLI `data.refresh` message. If `data.refresh.commands` exists, show the two command lines exactly. Continue through the okf-harness skill; mention a fresh session only when the returned refresh guidance asks for one.
