# Install the global runtime from setup

OKF Harness setup should install or update the shared `okfh` runtime globally rather than depending on transient `npx` execution after setup completes. Agent integrations need a stable local command for deterministic `okfh --json` workflows, while the setup package and installer scripts are only the entry path that prepares that runtime and the selected native agent integrations. When setup finds an older global runtime, it should show the current and target versions and ask before updating, defaulting the answer to yes. If global installation fails because of permissions, setup must not run `sudo`; it should report the failure and offer user-level npm prefix guidance or a command for the person to run explicitly.

If Node.js is missing or older than the supported floor, setup should state that Node.js 22 or newer is required and point to the official Node.js website, without suggesting package-manager-specific install commands.

Setup may check for `git`, but missing `git` should warn rather than block native integration installation. Workspace creation and management can require git later, while agent integration setup should still complete when possible.

Setup should not create the first OKF Harness workspace. After successful installation, it may print one optional next-step prompt for opening the selected agent client and asking it to set up a workspace. If exactly one agent integration was selected, the prompt should use that agent's concrete prefix; if multiple integrations were selected, it can use wording like: `[Optional] Open your agent and ask (use $okf-harness-bootstrap if you're using Codex): /okf-harness-bootstrap Set up a workspace for my AI research notes.`

The existing `okfh bootstrap install|repair|status|uninstall --agents ...` surface remains as fallback, repair, and advanced CLI tooling, but it should move out of README and release-body install instructions into CLI or advanced documentation.

Starting with the v0.6 setup direction, the `@okf-harness/cli` package should no longer use postinstall to write agent bootstrap entrypoints by default. Agent integration writes belong to setup or native integration installation, while `okfh bootstrap repair` remains available for advanced fallback repair.

The CLI package postinstall should not print setup guidance as a substitute; setup user messaging belongs to `@okf-harness/setup` and the installer scripts.
