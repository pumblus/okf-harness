# OKF Harness Agent Guide

This file is the canonical agent guide for OKF Harness. Runtime-specific files such as `CLAUDE.md` should delegate here instead of duplicating rules.

## Project

- OKF Harness is agent-first, local-first, terminal-native, and open source.
- Runtime target: Node.js 22+, TypeScript, ESM, pnpm.
- Public product surface: `README.md`, `README.zh-CN.md`, `docs/WORKFLOWS.md`, `docs/zh-CN/WORKFLOWS.md`, `docs/CLI.md`, `docs/zh-CN/CLI.md`, `docs/ROADMAP.md`, `docs/zh-CN/ROADMAP.md`, `CONTEXT.md`, and `docs/adr/`.
- Public website-planning surface: `docs/website/ROADMAP.md` and `docs/zh-CN/website/ROADMAP.md`.
- Current public product scope lives in `docs/ROADMAP.md`, ADRs, and the issue tracker. The website roadmap tracks website-only direction and does not define product scope. Keep this file to durable repository rules.

## Hard rules

- Before editing, check the current tree with `git status --short`.
- Keep changes scoped to the user's explicit request and the current public scope.
- Do not auto-commit, tag, push, publish, create releases, or close public issues unless the user explicitly asks in the current turn.
- Do not store API keys, tokens, or credentials in tracked files.
- Do not edit ignored `dist/` output by hand. Build it from source when package contents need verification.
- Do not edit generated raw source files in OKF Harness workspaces. `raw/sources/` is immutable by design.
- For source ingestion behavior, copy source files and record hashes; never move or rewrite the user's originals.
- For write-capable CLI behavior, support dry-run or a pending action before overwriting files.
- The root package stays private. Publish only package manifests that explicitly declare public package metadata.
- Runtime integrations have two surfaces: workspace-local adapters and native host bootstrap packages. Do not treat native bootstrap support as workspace-local daily adapter support unless the CLI and docs both expose it.

## Repository map

| Path | Owns | Local guide | Verify |
|---|---|---|---|
| `packages/core` | OKF parsing, config, manifest, path safety, lint, search, graph, source handling, evidence/read behavior | `packages/core/AGENTS.md` | `pnpm test packages/core/test && pnpm typecheck` |
| `packages/cli` | `okfh` command registration, terminal UX, JSON contracts, CLI integration | `packages/cli/AGENTS.md` | `pnpm test packages/cli/test && pnpm typecheck` |
| `packages/agent-pack` | Claude/Codex adapter renderers, shared templates, managed guidance blocks | `packages/agent-pack/AGENTS.md` | `pnpm test packages/agent-pack/test && pnpm typecheck` |
| `packages/setup` | Universal setup package, setup plans, runtime install/update flow, selected native integration installs | `packages/setup/AGENTS.md` | `pnpm test packages/setup/test && pnpm typecheck` |
| `packages/native-integration` | Native host bootstrap package and global `okf-harness-bootstrap` | `packages/native-integration/AGENTS.md` | `pnpm test packages/native-integration/test && pnpm smoke:tarball` |
| `docs` | Public docs, ADRs, product and website roadmaps, repo-local agent workflow docs | `docs/AGENTS.md` | Check links, command names, and matching zh-CN docs when applicable |

## Agent workflow docs

Use repo-local workflow docs under `docs/agents/` when the task touches that workflow:

- `docs/agents/issue-tracker.md` for issues and PRDs.
- `docs/agents/triage-labels.md` for labels and triage states.
- `docs/agents/domain.md` for domain documentation layout.
- `docs/agents/release.md` for the full public release checklist.

## Working flow

- Start from the nearest relevant `AGENTS.md`, then read the product docs or package files needed for the task.
- Prefer small, direct patches over broad rewrites.
- Keep public docs concise; move stable decisions to ADRs or repo-local agent docs.
- Update tests, fixtures, docs, and generated outputs together when a behavior change requires them.
- After file changes, inspect `git diff` and `git status --short`.

## Verification

Default checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For package manifest, postinstall, CLI shim, tarball, or release changes, also run:

```bash
pnpm smoke:tarball
```

After workspace/wiki edits, run:

```bash
okfh check --workspace <workspace> --json
```

## Commit rules

- Use Conventional Commits: `<type>[optional scope]: <description>`.
- Allowed types: `feat`, `fix`, `refactor`, `docs`, `chore`.
- Keep commits atomic. A commit touching more than about 20 files should split into packaging, docs, scripts, or per-package units unless every file is the same generated output from a regeneration command.

## Release rules

- A public release is not shipped until GitHub repository state, GitHub Release, npm registry state, package contents, and documented install commands are verified together.
- Do not claim a release is shipped while README install commands can still fail.
- Use `docs/agents/release.md` for the full release checklist.
- Before the v0.6 installer workflow ships, release notes may keep the README global CLI install followed by `okfh doctor --json`.
- For v0.6.0 and later, GitHub Releases attach `install.sh` and `install.ps1`; verify them by downloading the assets back before claiming installer publication.
- For v0.6.0 and later, release body Install sections show the recommended installer path. Do not list native or direct CLI commands there; link to docs for those.

### Release template

- Release title: `v{version} {title}`
  - Use a short one to three word playful motif, not a literal summary.
  - The title should feel slightly mysterious on first read; its meaning should become clear after reading the release notes.
  - For each `v0.x.0` release, introduce a new motif or imagery. Subsequent patch releases within the same minor series should continue, evolve, or riff on that motif.
  - Example: `v0.4.0 Lights On`, because the release turns on the Evidence Brief workflow, giving agents bounded wiki evidence before they answer.

- Release body: Markdown using this structure. Fill the Install section from the version-specific rule above:

```markdown
One-line sentence describing what this release enables for users.

## Install

<release-appropriate install block>

## What changed

- Lead with the most important user-visible changes.
- Focus on new capabilities, completed workflows, behavioral changes, or boundary changes rather than implementation details.
- Explain why each change matters to users or agents, not just what changed.
- Keep the list concise, usually three to six bullets, with one coherent improvement per bullet.

## Notes

- State the release scope and intent: milestone, completion, refinement, stabilization, or patch.
- Call out important non-goals or unchanged boundaries when they set expectations.
- Mention compatibility, migration, packaging, or release-asset notes only when relevant.
- End with release-specific context that helps readers understand direction without turning Notes into a roadmap.
```

## Instruction maintenance

- Keep `AGENTS.md` focused on rules that change agent behavior in this repository.
- Use the no-op test: if a line only restates good general behavior, delete it or move it to normal docs.
- Do not copy one-off review reports, local machine paths, private preferences, dated diagnostics, or internal planning notes into durable public instructions.
- Runtime-specific instruction files should delegate here instead of duplicating guidance.
