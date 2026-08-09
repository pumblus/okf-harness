# Setup

## Intent

Create the first OKF Harness workspace from a parent folder.

## Preconditions

- Infer the display name and target folder from the request before asking questions.
- Ask only for inputs that remain missing or ambiguous after inference.
- Set the agent target from **self-report** alone — the client you know yourself to be. Claude Code: `--agents claude`. Codex: `--agents codex`. Any other client: `--agents none`, which creates the workspace without workspace-local guidance and leaves the repair route to add it later.
- Honor explicit user paths. When no parent folder is explicit, default to a user-visible `Documents/OKF Harness` parent folder.
- For English display names, derive a conservative folder slug: lowercase ASCII words, hyphen separators, collapsed punctuation. Keep the display name friendly.
- For non-Latin display names, allow a UTF-8 folder name by default. Do not translate it; only remove path separators and control characters.
- Before persistent writes, show a short summary with name, path, and agent target unless all three were explicit in the user's request.
- Refuse a non-empty target directory unless `npx @okf-harness/setup@latest launch --workspace <path> -- status --json` shows it is already an OKF Harness workspace; tell the user to choose an empty directory or a new subdirectory.
- If the target is an initialized workspace, stop setup and use the repair route.

## Allowed Commands

```bash
npx --yes --package @okf-harness/cli@0.7.0 okfh init <workspace> --name <name> --agents <agent-target> --dry-run --json
npx --yes --package @okf-harness/cli@0.7.0 okfh init <workspace> --name <name> --agents <agent-target> --json
npx @okf-harness/setup@latest launch --workspace <workspace> -- status --json
```

## Allowed Writes

- A new OKF Harness workspace at the confirmed target path.
- Workspace-local guidance created by the runtime's `init --agents <agent-target>` operation, when the agent target is not `none`.

## Completion Condition

Report the workspace path and the CLI `data.refresh` message. If `data.refresh.commands` exists, show the two command lines exactly. Continue through the okf-harness skill; mention a fresh session only when the returned refresh guidance asks for one.
