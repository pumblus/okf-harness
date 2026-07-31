# Use a dedicated setup package for the recommended install path

_Status: the dedicated setup package remains active; shared-runtime installation and post-install doctor guidance are superseded by #90 and #93. Native command completion is reported separately from integration-state verification._

OKF Harness should publish a dedicated `@okf-harness/setup` package for the recommended installer flow instead of making ordinary users start from `@okf-harness/cli` or an `okfh setup` command. The setup package detects supported agent clients, installs selected native integrations, and exposes the version-independent launcher that resolves each workspace's pinned runtime on demand.

Installer scripts should delegate to this setup package, and direct `npx @okf-harness/setup` usage should provide the same interactive setup plan, agent detection, and command-result reporting as the scripts.

The setup package may expose advanced non-interactive options such as `--agents <list|auto>`, `--yes`, and `--dry-run`, but the default user experience remains interactive agent selection.

In non-interactive mode, `--agents auto --yes` should install only detected integrations that are native-supported and preselected by default. Explicit opt-in integrations such as OpenClaw must be named with `--agents openclaw --yes`.

`--dry-run` should produce a local setup plan without requiring network access. Remote package, marketplace, or registry availability checks should be explicit through a separate option such as `--verify-remote`.

Interactive setup should also avoid separate preflight remote availability checks by default. The selected native install commands perform remote access during execution; failures should report the failed command and a concrete next step.

Selected native integrations install independently. If one native install command fails, setup skips that integration's remaining write commands, preserves the command warning, probes final host state, and continues with every remaining selection. A selected integration succeeds only when that final state is `verified`; `failed` and `unavailable` make setup exit nonzero.

The setup plan names every selected integration's read-only verification commands and expected canonical identity. `--dry-run` displays those actions without probing, accessing the network, or writing files. Setup and doctor share one verification definition and parser per agent client, and neither surface includes raw host stdout or stderr in diagnostics. A missing, unsuccessful, or incompatible probe is `unavailable` and directs the person to update the host and retry instead of relying on a maintained version table.

Doctor keeps host CLI detection separate from native integration verification in the `nativeIntegrations` group. Missing host CLIs skip verification, verified integrations pass, and failed or unavailable integration state warns without failing the overall doctor run. Setup also summarizes shadowing-global-runtime cleanup without depending on a global `okfh`; advanced diagnostics remain available through the transient `npx` doctor command documented in the CLI reference.
