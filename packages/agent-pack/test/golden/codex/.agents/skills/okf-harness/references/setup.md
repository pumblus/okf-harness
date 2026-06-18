# Setup Workflow

## First-time setup

For Codex, run:

```bash
okfh init <workspace> --name <name> --agents codex --json
```

For Claude Code, run:

```bash
okfh init <workspace> --name <name> --agents claude --json
```

Use `--agents all` only when the user explicitly asks to prepare both supported agents. Use `--agents none` only for advanced or developer setup.

## Repair adapter support

Repair the current agent first:

```bash
okfh agent install codex --workspace <workspace> --json
okfh agent install claude --workspace <workspace> --json
```

Choose the command that matches the current agent. If the command returns conflicts, explain the conflicting paths and ask before using `--force`.

After setup or repair, run `okfh status --workspace <workspace> --json` and remind the user to start a fresh Codex thread or Claude Code session.
