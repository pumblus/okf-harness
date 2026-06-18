# Setup Workflow

## First-Time Setup

Choose the command for the current agent.

Codex:

```bash
okfh init <workspace> --name <name> --agents codex --json
```

Claude Code:

```bash
okfh init <workspace> --name <name> --agents claude --json
```

Use `--agents all` only when the user explicitly asks to prepare both supported agents. Use `--agents none` only for advanced or developer setup.

## Repair Adapter Support

Choose the repair command for the current agent.

Codex:

```bash
okfh agent install codex --workspace <workspace> --json
```

Claude Code:

```bash
okfh agent install claude --workspace <workspace> --json
```

Do not install both adapters unless the user asks for both. If the command returns conflicts, explain the conflicting paths and ask before using `--force`.

## Completion Check

After setup or repair, run:

```bash
okfh status --workspace <workspace> --json
```

Finish by reporting the resolved workspace path, the adapter that was installed or repaired, any conflicts, and the client-specific refresh step: a fresh Codex thread or a fresh Claude Code session.
