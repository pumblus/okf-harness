# Repair

## Intent

{{repairIntent}}

## Preconditions

- The target path must already be an initialized OKF Harness workspace.
- {{repairAgentTargetClause}}
- If this skill was invoked from inside the selected workspace, do not run setup; repair {{repairInvokedGuidance}} and continue through {{workspaceInvocation}}.
- If a selected workspace already has {{currentGuidanceState}}, report the path and refresh guidance instead of reinstalling extra clients.

## Allowed Commands

```bash
npx @okf-harness/setup@latest launch --workspace <workspace> -- agent install {{agentsTarget}} --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- status --json
```

## Allowed Writes

- Managed {{managedGuidance}} under the selected workspace.
- Managed backups that the runtime's `agent install` operation creates for retired workflow skills.

## Completion Condition

Report the repair result and the CLI `data.refresh` message. If `data.refresh.commands` exists, show the two command lines exactly. Continue through {{workspaceInvocation}}; mention {{freshSession}} only when the returned refresh guidance asks for one.
