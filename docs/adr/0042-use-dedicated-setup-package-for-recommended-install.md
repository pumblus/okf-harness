# Use a dedicated setup package for the recommended install path

OKF Harness should publish a dedicated `@okf-harness/setup` package for the recommended installer flow instead of making ordinary users start from `@okf-harness/cli` or an `okfh setup` command. The setup package can install or verify the shared `okfh` runtime, but its public name matches the user's job: prepare OKF Harness for their agent clients.

Installer scripts should delegate to this setup package, and direct `npx @okf-harness/setup` usage should provide the same interactive setup plan, agent detection, and verification behavior as the scripts.

The setup package may expose advanced non-interactive options such as `--runtime-only`, `--agents <list|auto>`, `--yes`, and `--dry-run`, but the default user experience remains interactive agent selection.

In non-interactive mode, `--agents auto --yes` should install only detected integrations that are native-supported and preselected by default. Explicit opt-in integrations such as OpenClaw must be named with `--agents openclaw --yes`.

`--dry-run` should produce a local setup plan without requiring network access. Remote package, marketplace, or registry availability checks should be explicit through a separate option such as `--verify-remote`.

Interactive setup should also avoid separate preflight remote availability checks by default. The selected native install commands provide the remote verification during execution; failures should report the failed command and a concrete next step.

Selected native integrations should install independently. If one native install command fails, setup should continue with the remaining selected integrations, then summarize successes, failures, and retry commands.

After installing or updating the runtime and selected integrations, setup should run `okfh doctor --json` as final verification. Doctor workspace warnings should be reported but should not make setup fail, because setup does not create or select a workspace.

Doctor output should separate runtime checks, native integration checks, legacy bootstrap fallback checks, and workspace checks so the old bootstrap surface does not blur with v0.6 native integrations.
