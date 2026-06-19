# Setup Workflow

## Intent

Create an OKF Harness workspace or repair the current agent adapter's unified One Door skill.

## Preconditions

- For first-time setup, the user supplied or accepted a workspace path and name.
- For repair, the workspace resolves to `okfh.config.yaml`.
- Install the current agent's adapter unless the user explicitly asks for both Claude Code and Codex.

## Allowed Commands

First-time setup for Codex:

```bash
okfh init <workspace> --name <name> --agents codex --json
```

First-time setup for Claude Code:

```bash
okfh init <workspace> --name <name> --agents claude --json
```

Use `--agents all` only when the user explicitly asks to prepare both supported agents. Use `--agents none` only for advanced or developer setup.

Repair adapter support for Codex:

```bash
okfh agent install codex --workspace <workspace> --json
```

Repair adapter support for Claude Code:

```bash
okfh agent install claude --workspace <workspace> --json
```

Completion check:

```bash
okfh status --workspace <workspace> --json
```

## Allowed Writes

- `okfh init` may create the workspace skeleton, config, wiki seed files, and selected adapter files.
- `okfh agent install` may write managed root guidance and the unified `okf-harness` skill for the selected adapter.
- The CLI may back up old workflow skill directories under `.okfh/backups/agent-skills/`.
- Do not install both adapters unless the user asks for both. If the command returns conflicts, explain the conflicting paths and ask before using `--force`.

## Completion Condition

Finish by reporting the resolved workspace path, the adapter that was installed or repaired, any conflicts, and the client-specific refresh step: a fresh Codex thread or a fresh Claude Code session.
