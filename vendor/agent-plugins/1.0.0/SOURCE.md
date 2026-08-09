# Agent Plugins 1.0.0 plugin manifest schema (vendored)

`plugin.schema.json` in this directory is an unmodified copy of the official Agent Plugins 1.0.0 plugin manifest JSON Schema.

- Source URL: <https://agent-plugins.org/schemas/1.0.0/plugin.schema.json>
- Fetched: 2026-08-09
- Purpose: the artifact test in `packages/agent-pack/test/marketplace.test.ts` validates `plugins/agent-plugins/okf-harness/plugin.json` against this copy, so manifest conformance is checked offline and deterministically on every test run. A conformance break must never depend on network access to fail.
- Update rule: when the Agent Plugins standard publishes a new schema version, vendor the new file into its own versioned directory here and point the artifact test at it.
