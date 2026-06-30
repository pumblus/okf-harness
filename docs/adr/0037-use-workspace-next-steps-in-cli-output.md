# Use workspace next steps in CLI output

OKF Harness should report a person-facing workspace next step through the existing `next` field and human CLI output for `status` and `check`, rather than adding a new `okfh next` command, machine-only status code, or onboarding state machine. The suggestion should be based only on local deterministic workspace facts, live in the CLI for v0.5.3 instead of the public core API, and point the person toward the first useful loop without implying semantic content quality, automatic repair, webpage fetching, or CLI-generated wiki synthesis.
