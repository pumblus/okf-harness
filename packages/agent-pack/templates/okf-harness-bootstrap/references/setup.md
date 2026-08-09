# Setup

## Intent

Create the first OKF Harness workspace{{intentAgent}} from a parent folder.

## Preconditions

- Infer {{inferSubjects}} from the request before asking questions.
- Ask only for inputs that remain missing or ambiguous after inference.
- {{agentTargetClause}}
- Honor explicit user paths. When no parent folder is explicit, default to a user-visible `Documents/OKF Harness` parent folder.
- For English display names, derive a conservative folder slug: lowercase ASCII words, hyphen separators, collapsed punctuation. Keep the display name friendly.
- For non-Latin display names, allow a UTF-8 folder name by default. Do not translate it; only remove path separators and control characters.
- Before persistent writes, show a short summary with name, path, and agent target unless all three were explicit in the user's request.
- Refuse a non-empty target directory unless `npx @okf-harness/setup@latest launch --workspace <path> -- status --json` shows it is already an OKF Harness workspace; tell the user to choose an empty directory or a new subdirectory.
- If the target is an initialized workspace, stop setup and use the repair route.

## Allowed Commands

```bash
npx --yes --package @okf-harness/cli@{{runtimeVersion}} okfh init <workspace> --name <name> --agents {{agentsTarget}} --dry-run --json
npx --yes --package @okf-harness/cli@{{runtimeVersion}} okfh init <workspace> --name <name> --agents {{agentsTarget}} --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- status --json
```

## Allowed Writes

- A new OKF Harness workspace at the confirmed target path.
- {{guidanceWrite}}

## Completion Condition

Report the workspace path and the CLI `data.refresh` message. If `data.refresh.commands` exists, show the two command lines exactly. Continue through {{workspaceInvocation}}; mention {{freshSession}} only when the returned refresh guidance asks for one.
