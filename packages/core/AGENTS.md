# Core Package Agent Guide

This file refines the root `AGENTS.md` for `packages/core`.

## Owns

`packages/core` owns OKF Harness core behavior:

- OKF parsing
- config loading
- manifest behavior
- path safety
- lint/check behavior
- search
- graph
- source handling
- bounded evidence inputs
- continuation reads
- workspace skeleton generation

## Boundaries

- The core package must not depend on CLI, Agent, `agent-pack`, or other higher-level packages.
- Keep core behavior local-first and deterministic.
- Do not introduce network fetching, background daemons, vector databases, private agent runtime, GUI behavior, cloud sync, accounts, or team permissions here.
- Source ingestion must copy source files and record hashes; never move or rewrite user originals.
- `raw/sources/` in OKF Harness workspaces is immutable by design.
- URL sources remain pointers unless a public CLI/docs contract explicitly adds fetching behavior.
- Keep normal answer workflows on synthesized `wiki/` content.
- Preserve JSON limit metadata, citation metadata, and bounded-read behavior.

## Hotspots

- `packages/core/src/workspace/index.ts` owns the generated OKF Harness workspace skeleton and workspace plan until a durable template directory exists.
- `packages/core/src/evidence/index.ts` owns bounded answer inputs.
- `packages/core/src/read/index.ts` owns continuation reads.
- `packages/core/test/fixtures/valid-workspace` owns fixture workspace behavior and sample sources used by core and CLI tests.
- Path safety changes must be tested against unsafe paths, workspace escapes, and valid workspace paths.
- Manifest or config changes must update tests and any public docs that describe the behavior.

## Verification

Default package verification:

```bash
pnpm test packages/core/test
pnpm typecheck
```

For evidence or read changes, also run the focused tests:

```bash
pnpm test packages/core/test/evidence.test.ts packages/core/test/read.test.ts
pnpm typecheck
```

After workspace/wiki fixture changes, also run:

```bash
okfh check --workspace <workspace> --json
```

If package manifests, tarball contents, or public package behavior changed, also run from the repository root:

```bash
pnpm smoke:tarball
```