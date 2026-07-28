# Native Integration Package Agent Guide

This file refines the root `AGENTS.md` for `packages/native-integration`.

## Owns

`packages/native-integration` owns the Pi, OpenCode, and OpenClaw native npm package.

Its public surface is intentionally narrow:

- expose the unified host-level `okf-harness` entrypoint
- support Pi, OpenCode, and OpenClaw native host behavior before and inside workspaces
- provide packaged assets explicitly required by that host surface

## Boundaries

- Keep the package free of runtime install hooks.
- Expose only the host-level `okf-harness` entrypoint.
- Route deterministic operations through the runtime launcher; never require a global `okfh`.
- Do not claim this package installs workspace-local adapters for Pi, OpenCode, or OpenClaw.
- Do not introduce GUI, cloud sync, accounts, team permissions, background daemons, or private agent runtime.
- Do not rely on ignored local files, personal home-directory caches, or machine-specific paths.
- Package contents must come from explicit source and manifest allowlists, not accidental workspace inclusion.

## Skill and guidance changes

For native skill or reference changes, follow the `writing-great-skills` checklist when available. If it is not available, preserve the same constraints:

- keep triggers concrete
- include exclusions
- keep guidance local-first
- keep each distribution's host skill aligned with the shared Claude/Codex host template
- update generated or packaged outputs together with source changes

Coordinate with `packages/agent-pack/AGENTS.md` when native guidance overlaps shared Claude/Codex templates.

## Verification

Default package verification:

```bash
pnpm test packages/native-integration/test
pnpm typecheck
```

For package contents, manifest, global binary, tarball, or release changes, also run:

```bash
pnpm smoke:tarball
```

Before release handoff, verify package contents rather than relying only on manifest shape.
