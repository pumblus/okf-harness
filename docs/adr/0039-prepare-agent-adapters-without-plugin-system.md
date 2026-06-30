# Prepare agent adapters without a plugin system

v0.5.5 should prepare OKF Harness for more agent adapters by tightening adapter profiles, shared template rendering, and adapter contract tests, not by adding new adapters or introducing a plugin architecture. Future adapters should require localized profile and template changes where possible, while the default product path remains the same terminal-native `okfh --json` workflow used by Claude Code and Codex.
