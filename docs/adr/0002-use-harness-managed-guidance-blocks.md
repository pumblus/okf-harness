# Use harness-managed guidance blocks

Generated OKF Harness workspaces update root agent guidance files through clearly marked managed blocks rather than owning the whole `AGENTS.md` or `CLAUDE.md` file. This preserves user-written project guidance while still giving the harness an idempotent upgrade path for adapter instructions. The development repository may still keep runtime-specific guidance thin, such as delegating `CLAUDE.md` to `AGENTS.md`, because that is maintainer workflow rather than generated product behavior.
