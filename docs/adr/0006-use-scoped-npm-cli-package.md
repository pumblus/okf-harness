# Use a scoped npm CLI package

OKF Harness uses `@okf-harness/cli` as the npm package people install to get the `okfh` command, while `@okf-harness/core` and `@okf-harness/agent-pack` remain internal package-family members published for reuse. This keeps the release shape honest for a monorepo, while README copy explains that ordinary users install the CLI package once and then operate through Claude Code or Codex.
