# Agent Pack Package Agent Guide

This file refines the root `AGENTS.md` for `packages/agent-pack`.

## Owns

`packages/agent-pack` owns:

- Claude adapter rendering
- Codex adapter rendering
- shared OKF Harness skill templates
- generated root guidance managed blocks
- adapter install planning
- agent-pack golden fixtures

## Boundaries

- The agent-pack package renders shared templates for Claude and Codex adapters.
- Do not maintain divergent manual skill copies across adapters.
- Keep shared template source as the source of truth; regenerate adapter outputs or fixtures instead of hand-editing generated output.
- Do not add private agent runtime behavior.
- Do not make agent-pack depend on CLI command execution for core template rendering.
- Keep generated guidance bounded, local-first, and aligned with public OKF Harness scope.

## Skill and reference changes

For agent skill or reference changes, follow the `writing-great-skills` checklist when available. If it is not available, preserve the same constraints:

- define a concrete trigger
- include clear exclusions
- keep the outcome contract explicit
- avoid restating generic model behavior
- keep shared template source canonical
- update generated adapter output and tests together
- verify that Claude and Codex guidance remain equivalent where they should be equivalent

Use this rule before editing:

- `packages/agent-pack/templates/okf-harness/`
- generated skill guidance
- adapter managed blocks

## Hotspots

- `packages/agent-pack/src/index.ts` owns Claude/Codex skill rendering, root guidance managed blocks, and adapter install planning.
- Template changes must update package tests and generated golden fixtures when fixture output changes.
- Versioned generated fixtures must align with the release version when preparing a release.

## Verification

Default package verification:

```bash
pnpm test packages/agent-pack/test
pnpm typecheck
```

For release, manifest, template asset, or tarball changes, also run:

```bash
pnpm smoke:tarball
```