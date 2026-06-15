# Init Workflow

## First-time setup

Run:

```bash
okfh init <workspace> --name <name> --agents all --json
```

Use `--agents claude`, `--agents codex`, or `--agents none` only when the user explicitly asks for that narrower target.

## Repair adapter support

Run:

```bash
okfh agent install all --workspace <workspace> --json
```

If the command returns conflicts, explain the conflicting paths and ask before using `--force`.
