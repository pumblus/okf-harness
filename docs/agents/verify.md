# Verify loop

The completion bar for every change, run in order:

1. `pnpm -w run test` — add or update a test that proves the change.
2. `pnpm -w run typecheck` — clean.
3. `pnpm -w run lint` — clean (Biome plus the llms docs freshness check); it must pass before a PR.
4. CLI behavior changes: `pnpm -w run build`, then exercise the built binary, e.g. `node packages/cli/dist/main.js check --workspace <ws> --json`. Workspace or wiki changes get the same `okfh check` treatment against that workspace.

Use the smallest verifier that proves the change while the work is in progress; the full loop above is the bar before you call a change done.

Every script lives at the workspace root, so keep the `-w` flag: from a package directory the `pnpm <script>` shorthand falls back to `pnpm exec` and reports `Command "lint" not found`.

Completion: the change is proven by a passing test, `pnpm -w run typecheck` and `pnpm -w run lint` are clean, and any CLI change is demonstrated against the built binary.
