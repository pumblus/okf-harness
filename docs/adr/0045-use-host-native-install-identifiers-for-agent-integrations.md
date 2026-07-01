# Use host-native install identifiers for agent integrations

OKF Harness should use the install identifier that feels native in each supported agent client instead of forcing every integration through one npm package shape. The recommended native identifiers for v0.6 are: Claude Code and Codex install `okf-harness@okf-harness` from the main-repository marketplace, Pi installs `npm:@pumblus/okf-harness`, OpenCode installs `@pumblus/okf-harness` as a global plugin, Hermes Agent installs `pumblus/okf-harness/okf-harness` from a custom skill tap, and OpenClaw installs `@pumblus/okf-harness` from its native skill registry. The `@pumblus/okf-harness` package should serve both Pi and OpenCode with host-specific entries inside the package, while the `@okf-harness/*` npm scope remains for runtime and setup packages such as `@okf-harness/cli` and `@okf-harness/setup`.

Native integration packages and registry entries may check whether `okfh` is available and tell the person to run the recommended installer or `npx @okf-harness/setup`, but they must not silently install or update the global runtime themselves.

Claude Code and Codex plugins should warn, not block, if runtime validation is possible during installation. Their bootstrap entrypoint must still check `okfh` on first use and give the recommended installer or setup command when the runtime is missing.

Native integrations should expose only the global `okf-harness-bootstrap` entrypoint. The high-frequency `okf-harness` workflow remains workspace-local and should be installed by workspace setup or repair after a workspace is created or selected.

Release verification for v0.6 native integrations must add and install the Claude Code and Codex marketplace entries from the published main repository state, confirm plugin versions match the released OKF Harness packages, and smoke the bootstrap entrypoint behavior with and without the `okfh` runtime.

Release verification must also pack and inspect `@pumblus/okf-harness`, smoke OpenCode installation with the host CLI when available, and verify the Pi package contract through package contents plus a real Pi install smoke before release when a Pi environment is available.

Hermes Agent and OpenClaw verification should validate the published skill or registry package shape and run host CLI install smokes when those CLIs are available. If a host CLI is unavailable in CI, the release checklist must mark that verification as manual rather than claiming automated coverage.
