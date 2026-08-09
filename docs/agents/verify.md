# Verify loop

The completion bar for every change, run in order:

1. `pnpm test` — add or update a test that proves the change.
2. `pnpm typecheck` — clean.
3. `pnpm lint` — clean (Biome plus the llms docs freshness check); it must pass before a PR.
4. CLI behavior changes: `pnpm build`, then exercise the built binary, e.g. `node packages/cli/dist/main.js check --workspace <ws> --json`. Workspace or wiki changes get the same `okfh check` treatment against that workspace.

Use the smallest verifier that proves the change while the work is in progress; the full loop above is the bar before you call a change done.

Completion: the change is proven by a passing test, `pnpm typecheck` and `pnpm lint` are clean, and any CLI change is demonstrated against the built binary.
