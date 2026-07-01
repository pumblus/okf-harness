# Setup

## Intent

Create the first OKF Harness workspace for Claude Code from a parent folder.

## Preconditions

- Infer the display name, target folder, current agent, and Git choice from the request before asking questions.
- Ask only for inputs that remain missing or ambiguous after inference.
- The current agent is `claude`; use `--agents claude` unless the user explicitly asks for additional clients.
- Honor explicit user paths. When no parent folder is explicit, default to a user-visible `Documents/OKF Harness` parent folder.
- For English display names, derive a conservative folder slug: lowercase ASCII words, hyphen separators, collapsed punctuation. Keep the display name friendly.
- For non-Latin display names, allow a UTF-8 folder name by default. Do not translate it; only remove path separators and control characters.
- If Git is not explicit, ask for confirmation and say the default and recommended answer is no. Use `--git` only after an explicit yes.
- Before persistent writes, show a short summary with name, path, agent target, and Git choice unless all four were explicit in the user's request.
- Refuse a non-empty target directory unless `okfh status --workspace <path> --json` shows it is already an OKF Harness workspace; tell the user to choose an empty directory or a new subdirectory.
- If the target is an initialized workspace, stop setup and use the repair route.

## Allowed Commands

```bash
okfh init <workspace> --name <name> --agents claude --dry-run --json
okfh init <workspace> --name <name> --agents claude --json
okfh init <workspace> --name <name> --agents claude --git --json
okfh status --workspace <workspace> --json
```

## Allowed Writes

- A new OKF Harness workspace at the confirmed target path.
- Claude Code workspace-local guidance created by `okfh init --agents claude`.

## Completion Condition

Report the workspace path, whether Git was initialized, and the `data.refresh` message from the CLI. If `data.refresh.commands` exists, show the two command lines exactly; otherwise repeat the natural-language refresh message before telling the user to use `/okf-harness` in the fresh Claude Code session.
