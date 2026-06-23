# Repair

## Intent

Install or repair {{agentLabel}} workspace-local guidance for a selected OKF Harness workspace.

## Preconditions

- The target path must already be an initialized OKF Harness workspace.
- Repair only {{agentLabel}} unless the user explicitly asks for another agent.

## Allowed Commands

```bash
okfh agent install {{agentAdapter}} --workspace <workspace> --json
okfh status --workspace <workspace> --json
```

## Allowed Writes

- Managed {{agentLabel}} workspace guidance under the selected workspace.
- Managed backups that `okfh agent install` creates for retired workflow skills.

## Completion Condition

Report the repair result and tell the user to open a fresh {{sessionName}} from the workspace folder so `{{workspaceInvocation}}` is loaded.
