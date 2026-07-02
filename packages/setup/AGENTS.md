# Setup Package Agent Guide

This file refines the root `AGENTS.md` for `packages/setup`.

## Owns

`packages/setup` owns:

- Universal setup package behavior
- setup plan generation
- global `okfh` runtime install or update flow
- selected native integration install flow
- dry-run planning for setup flows

## Boundaries

- Keep `--dry-run` local-only: no network checks, filesystem writes, or native install execution.
- Use `--verify-remote` for explicit remote availability checks.
- In non-dry-run setup, install or update the global `okfh` runtime only after explicit confirmation or `--yes`.
- Install selected native integrations only after the setup plan is shown and the user confirms, or when `--yes` makes that confirmation explicit.
- Continue remaining selected native installs when one host install fails, then summarize successes, failures, and retry commands.
- Do not run `sudo`.
- Do not create the first OKF Harness workspace.
- Setup behavior should produce a clear plan before taking write-capable action.
- Do not store credentials or infer private machine state beyond what the user or local command output provides.
- Keep setup behavior distinct from daily workspace-local adapter support unless the CLI and docs both expose that support.

## Hotspots

- `packages/setup/src/index.ts` owns Universal setup planning and execution.
- Plan output changes must update tests.
- Public setup behavior changes must update README or workflow docs when they affect documented install/setup paths.

## Verification

Default package verification:

```bash
pnpm test packages/setup/test
pnpm typecheck
```

For package manifest, install path, tarball, or release changes, also run:

```bash
pnpm smoke:tarball
```
