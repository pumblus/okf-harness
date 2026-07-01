# Use native-supported levels for v0.6 agent integrations

OKF Harness v0.6 should treat Claude Code, Codex, OpenCode, Pi, Hermes Agent, and OpenClaw as the supported agent set and prefer each client's native plugin, package, or skill installation surface before falling back to managed files. Claude Code, Codex, OpenCode, Pi, and Hermes Agent are `native-supported` and preselected when detected; OpenClaw is also `native-supported` but requires explicit opt-in because its skill loading, allowlist, and global install behavior carry a higher safety burden.

Interactive setup should show an extra safety note when the person selects OpenClaw. Non-interactive setup with `--agents openclaw --yes` should treat the explicit agent selection and yes flag as sufficient confirmation.
