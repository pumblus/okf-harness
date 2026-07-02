# CLI Package Agent Guide

This file refines the root `AGENTS.md` for `packages/cli`.

## Owns

`packages/cli` owns the terminal-native OKF Harness command surface:

- `okfh` command registration
- command wiring
- terminal output
- `--json` output contracts
- error normalization
- option parsing
- CLI integration between `core` and `agent-pack`
- bootstrap and adapter install command behavior

## Boundaries

- Keep CLI output compatible with `okfh --json`.
- Do not introduce alternate default tool channels.
- Keep rendering, option parsing, and error normalization in dedicated CLI modules when they grow beyond command wiring.
- Write-capable CLI behavior must support dry-run or a pending action before overwriting files.
- Do not make CLI commands silently crawl the web, rewrite bulk wiki content, or fetch URL source bodies unless the CLI docs and tests intentionally expose that behavior.
- Keep command behavior aligned with `docs/CLI.md` and `docs/zh-CN/CLI.md`.

## Hotspots

- `packages/cli/src/index.ts` owns terminal-native command registration and connects core with agent-pack.
- `packages/cli/test/bootstrap.test.ts` owns global bootstrap and adapter install contract coverage.
- `packages/cli/test/helpers.ts` owns shared temp-workspace and JSON helpers.
- Split command-domain tests instead of growing one catch-all test file.
- If a command adds or changes JSON fields, update tests and public CLI docs together.

## Verification

Default package verification:

```bash
pnpm test packages/cli/test
pnpm typecheck
```

For bootstrap, adapter install, postinstall, CLI shim, manifest, tarball, or release changes, also run:

```bash
pnpm smoke:tarball
```

For public CLI behavior changes, cross-check docs:

```bash
git diff docs/CLI.md docs/zh-CN/CLI.md
```