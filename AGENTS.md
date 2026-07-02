# OKF Harness Agent Instructions

## Source of Truth

- Product overview: `README.md` and `README.zh-CN.md`.
- User workflows: `docs/WORKFLOWS.md` and `docs/zh-CN/WORKFLOWS.md`.
- CLI contract: `docs/CLI.md` and `docs/zh-CN/CLI.md`.
- Product terminology: `CONTEXT.md`.
- Architecture decisions: `docs/adr/`.
- Public roadmap: `docs/ROADMAP.md` and `docs/zh-CN/ROADMAP.md`.
- Current public scope lives in the roadmap, ADRs, and issue tracker. Keep this file to durable repository rules.

## Project Boundaries

- OKF Harness is agent-first, local-first, terminal-native, and open source.
- Runtime target: Node.js 22+, TypeScript, ESM, pnpm.
- Runtime integrations have two surfaces: workspace-local adapters and native host bootstrap packages. Do not treat native bootstrap support as workspace-local daily adapter support unless the CLI and docs both expose it.
- Out of scope for the current public scope: Obsidian runtime code, GUI, cloud sync, accounts, team permissions, vector databases, background daemons, automatic web crawling, silent bulk wiki rewrites, and private agent runtime.
- The root package stays private. Publish only package manifests that explicitly declare public package metadata.
- The core package must not depend on CLI, Agent, or other higher-level packages.
- The agent-pack package renders shared templates for Claude and Codex adapters; do not maintain divergent manual skill copies.
- The cli package connects core and agent-pack behavior through `okfh --json`.

## Repository Map

- `packages/core`: OKF parsing, config, manifest, path safety, lint, search, graph, source handling.
- `packages/cli`: `okfh` command line entrypoint and commands.
- `packages/agent-pack`: Claude/Codex adapter renderers and shared skill templates.
- `packages/setup`: Universal setup package and local Setup plan generation.
- `packages/native-integration`: Pi/OpenCode native package that exposes only global `okf-harness-bootstrap`.
- `packages/core/src/workspace/index.ts`: generated OKF Harness workspace skeleton and workspace plan until a durable template directory exists.
- `packages/core/test/fixtures/valid-workspace`: fixture workspace and sample sources used by core and CLI tests.

## Hotspot Ownership

- `README.md`, `docs/WORKFLOWS.md`, `docs/CLI.md`, `docs/ROADMAP.md`, `CONTEXT.md`, and `docs/adr/` own the public product surface. Keep user-facing docs concise and avoid exposing internal planning documents.
- `packages/core/src/workspace/index.ts` owns the OKF Harness workspace skeleton and workspace plan. Keep it free of agent-pack dependencies. Verify with `pnpm test packages/core/test` and `pnpm typecheck`.
- `packages/core/src/evidence/index.ts` and `packages/core/src/read/index.ts` own bounded answer inputs and continuation reads. Keep normal answer workflows on synthesized `wiki/` content, preserve JSON limit/citation metadata, and verify with `pnpm test packages/core/test/evidence.test.ts packages/core/test/read.test.ts` plus `pnpm typecheck`.
- `packages/agent-pack/src/index.ts` owns Claude/Codex skill rendering, root guidance managed blocks, and adapter install planning. Verify with `pnpm test packages/agent-pack/test` and `pnpm typecheck`.
- Agent skill or reference changes must use the `writing-great-skills` skill before editing `packages/agent-pack/templates/okf-harness/`, `packages/native-integration/skills/`, or generated skill guidance.
- `packages/cli/src/index.ts` owns the terminal-native command registration and connects core with agent-pack. Keep CLI output compatible with `okfh --json` and avoid alternate default tool channels. Keep rendering, option parsing, and error normalization in dedicated CLI modules when they grow beyond command wiring. Verify with `pnpm test packages/cli/test` and `pnpm typecheck`.
- `packages/cli/test/bootstrap.test.ts` owns global bootstrap and adapter install contract coverage. Keep shared temp-workspace and JSON helpers in `packages/cli/test/helpers.ts`; split command-domain tests instead of growing one catch-all file. Verify with `pnpm test packages/cli/test`.
- `packages/setup/src/index.ts` owns Universal setup dry-run planning. Keep it local-only by default: no network checks, no filesystem writes, and no native install execution in the first slice. Verify with `pnpm test packages/setup/test` and `pnpm typecheck`.
- `packages/native-integration` owns the Pi/OpenCode native npm package. Keep it free of runtime install hooks, expose only global `okf-harness-bootstrap`, and verify package contents with `pnpm test packages/native-integration/test` plus `pnpm smoke:tarball`.
- `pnpm-lock.yaml` owns dependency resolution state only. Do not hand-edit it; update it through pnpm when package manifests change, then verify with `pnpm install --frozen-lockfile` or the normal CI command set.

## Agent skills

Engineering workflow skills share repo-local setup through `docs/agents/` so issue, triage, and domain assumptions stay versioned with the project.

### Issue tracker

Use GitHub Issues for issues and PRDs. External PRs are not a triage request surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage state strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context domain documentation layout. See `docs/agents/domain.md`.

## Working Rules

- Before editing, check the current tree with `git status --short`.
- Keep changes scoped to the current public scope or the user's explicit request.
- Do not auto-commit, tag, push, publish, create releases, or close public issues unless the user explicitly asks in the current turn.
- Do not store API keys, tokens, or credentials in tracked files.
- Do not edit generated raw source files in OKF Harness workspaces. `raw/sources/` is immutable by design.
- Do not edit ignored `dist/` output by hand. Build it from source when package contents need verification.
- For source ingestion behavior, copy source files and record hashes; never move or rewrite the user's originals.
- For write-capable CLI behavior, support dry-run or a pending action before overwriting files.

## Release Rules

- A complete public release requires GitHub repository, GitHub Release, and npm registry state to be verified together. Do not claim shipped while README install commands can still fail.
- GitHub repository settings: verify GitHub auth, target repository state, git remote, current branch, and `HEAD`; keep Issues and GitHub Actions CI enabled; maintain canonical labels from `docs/agents/triage-labels.md`; use squash merge only; enable automatic deletion of merged head branches; keep Projects, Discussions, Wiki, and Dependabot disabled unless intentionally adopted.
- Public leak gates: confirm `git ls-files docs/implementation.md docs/okf-harness-intro.html docs/okf-harness-intro.pdf` has no output, then scan tracked files for private paths, local URLs, ignored override files, and internal document references.
- GitHub Release: use the repository tag convention, attach no extra release assets, create no public `RELEASE.md`, and keep the Install section to the README global CLI install followed by `okfh doctor --json`.
- npm scope and auth gates: verify `npm whoami`, package ownership, registry access, and current registry state before publishing; distinguish unpublished packages from permission errors.
- npm publish scope: publish only explicitly public package directories; never publish the root package or private workspace packages.
- npm manifest rules: no `workspace:` protocol entries in publishable manifests; internal package dependencies must point at the same public package version; `pnpm-workspace.yaml` must link matching workspace packages locally; publishable packages must declare the project runtime engine, run `pnpm run build` from `prepublishOnly`, and keep `files` allowlists to build output, package metadata, package-local README files, and runtime assets explicitly required by the package.
- npm publish flow: publish from each public package directory with `npm publish --access public` in dependency order; use the default release dist-tag; do not enable npm provenance unless the release workflow explicitly adopts and verifies it.
- npm preflight: inspect packed package contents, then run `pnpm smoke:tarball`. The smoke script owns the package list, tarball install checks, host CLI checks, and any release checklist gaps.
- npm post-publish proof: verify registry versions, then verify the documented registry install paths for the CLI, setup package, and native host integrations that are available in the release environment.

## Verification

- The default checks are:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- For package manifest, postinstall, CLI shim, or release changes, also run:

```bash
pnpm smoke:tarball
```

- After workspace/wiki edits, run:

```bash
okfh check --workspace <workspace> --json
```

- After file changes, inspect:

```bash
git diff
git status --short
```

## Documentation Rules

- Keep `AGENTS.md` as the shared project instruction source.
- Keep runtime-specific files thin. `CLAUDE.md` should delegate here instead of duplicating guidance.
- Put stable project decisions in tracked docs. Do not copy one-off review reports, local machine paths, private preferences, or dated diagnostics into public instructions.
