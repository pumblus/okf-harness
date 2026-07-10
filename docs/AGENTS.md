# Docs Agent Guide

This file refines the root `AGENTS.md` for `docs/` and top-level public documentation.

## Owns

- `README.md` and `README.zh-CN.md`: product overview and install entrypoint.
- `docs/WORKFLOWS.md` and `docs/zh-CN/WORKFLOWS.md`: user workflows.
- `docs/CLI.md` and `docs/zh-CN/CLI.md`: CLI contract.
- `docs/ROADMAP.md` and `docs/zh-CN/ROADMAP.md`: public product scope and roadmap.
- `docs/website/ROADMAP.md` and `docs/zh-CN/website/ROADMAP.md`: website-only roadmap; these files do not define product scope.
- `CONTEXT.md`: product terminology.
- `docs/adr/`: durable architecture decisions.
- `docs/agents/`: repo-local agent workflow instructions.

## Documentation rules

- Keep user-facing docs concise and product-facing.
- Do not expose internal planning documents, local-only review notes, private paths, local URLs, ignored override files, credentials, or dated diagnostics.
- Put stable project decisions in ADRs or tracked docs, not in release notes or temporary reports.
- Keep English and zh-CN docs aligned when the changed surface is user-visible.
- Use `CONTEXT.md` for product terminology; do not invent competing names for existing concepts.
- Update `docs/CLI.md` when a public CLI contract, JSON shape, command, flag, or default behavior changes.
- Update `docs/WORKFLOWS.md` when a user workflow changes.
- Update `docs/ROADMAP.md` only for intentional public product scope changes.
- Update `docs/website/ROADMAP.md` only for website-surface direction; it must not redefine product scope.
- Keep `docs/agents/` focused on reusable repo-local agent workflows, not one-off task transcripts.

## Verification

For docs-only changes:

```bash
git diff
git status --short
```

When docs mention commands, package names, release flow, or CLI behavior, verify the referenced command or cross-check the owning package tests.

When changing public CLI docs, also consider:

```bash
pnpm test packages/cli/test
pnpm typecheck
```