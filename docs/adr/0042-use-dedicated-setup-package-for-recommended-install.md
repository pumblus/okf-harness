# Use a dedicated setup package for the recommended install path

_Status: the dedicated setup package remains active; shared-runtime installation and post-install doctor guidance are superseded by #90 and #93. Native command completion is reported separately from integration-state verification._

OKF Harness should publish a dedicated `@okf-harness/setup` package for the recommended installer flow instead of making ordinary users start from `@okf-harness/cli` or an `okfh setup` command. The setup package detects supported agent clients, installs selected native integrations, and exposes the version-independent launcher that resolves each workspace's pinned runtime on demand.

Installer scripts should delegate to this setup package, and direct `npx @okf-harness/setup` usage should provide the same interactive setup plan, agent detection, and command-result reporting as the scripts.

The setup package may expose advanced non-interactive options such as `--agents <list|auto>`, `--yes`, and `--dry-run`, but the default user experience remains interactive agent selection.

In non-interactive mode, `--agents auto --yes` should install only detected integrations that are native-supported and preselected by default. Explicit opt-in integrations such as OpenClaw must be named with `--agents openclaw --yes`.

`--dry-run` should produce a local setup plan without requiring network access. Remote package, marketplace, or registry availability checks should be explicit through a separate option such as `--verify-remote`.

Interactive setup should also avoid separate preflight remote availability checks by default. The selected native install commands perform remote access during execution; failures should report the failed command and a concrete next step.

Selected native integrations should install independently. If one native install command fails, setup should continue with the remaining selected integrations, then summarize command completions, failures, and retry commands.

After running selected integration commands, setup should distinguish host CLI command completion from integration-state verification. Until a host-native status probe exists, exit 0 must be reported as unverified command completion, not as a verified installation. Setup should also summarize shadowing-global-runtime cleanup without depending on a global `okfh`. Advanced diagnostics remain available through the transient `npx` doctor command documented in the CLI reference.

Doctor output should separate runtime checks, native integration checks, legacy bootstrap fallback checks, and workspace checks so the old bootstrap surface does not blur with v0.6 native integrations.
