# Release Agent Checklist

Use only when preparing, validating, or writing up a public OKF Harness release. Owns operational release proof and the release notes template.

## Release principle

A release is not shipped until source state, GitHub state, npm registry state, package contents, and documented install paths are verified together. Missing evidence is an explicit gap, not an implied pass.

## Release size

Release size is decided per case from the feature arcs in the window, not by calendar cadence or commit thresholds. Signals that at least a minor is due: user-visible behavior changes, a new or changed install/distribution surface, or breaking API commits in a public package. A patch refines the same surface without behavior changes; in 0.x, breaking changes ship in a minor, not a patch.

## Preflight

- Tree is clean: `git status --short`.
- GitHub auth, target repo, remote, branch, and `HEAD` are correct.
- GitHub settings: Issues and Actions CI enabled; squash-merge only; auto-delete merged head branches; canonical labels from `docs/agents/triage-labels.md`; Projects, Discussions, Wiki, and Dependabot disabled.

## Public leak gates

- `git ls-files docs/implementation.md docs/okf-harness-intro.html docs/okf-harness-intro.pdf` prints nothing.
- Scan tracked files for private paths, local URLs, ignored override files, internal document references, credentials or tokens, and unpublished planning notes.

## Version and manifest gates

- Publish only explicitly public package directories; never the root or private workspace packages.
- No `workspace:` protocol entries in publishable manifests; internal package dependencies point at the same public version.
- `pnpm-workspace.yaml` links matching workspace packages locally.
- Publishable packages declare the runtime engine, build via `prepublishOnly`, and allowlist only build output, package metadata, package-local READMEs, and required runtime assets.
- Update `pnpm-lock.yaml` through pnpm only; never hand-edit it.

## npm

- `npm whoami`; verify ownership, registry access, and current registry state (unpublished vs permission-blocked).
- Inspect packed contents, then `pnpm smoke:tarball` — covers tarball installs, installer script sources, `@pumblus/okf-harness` inspection (Pi / OpenCode / OpenClaw entries), Hermes Agent skill tap shape, host CLI checks, and release checklist gaps.
- When Claude Code and Codex CLIs are available, also `pnpm smoke:marketplace`; otherwise record the missing host smoke as an explicit gap.
- Publish from each public package directory in dependency order: `npm publish --access public`, default dist-tag, no provenance unless the workflow explicitly adopts and verifies it.

## Post-publish proof

- Verify registry versions and dist-tags; documented setup and native host integration install paths.
- Inspect published `@pumblus/okf-harness` contents and Hermes Agent skill tap shape.
- Host install smokes: OpenCode when available; Pi, Hermes Agent, and OpenClaw when their CLIs are available — otherwise list each as a manual gap.
- Never claim shipped while any documented install command fails.

## GitHub Release

- Tag convention: `v{version}`. No public `RELEASE.md`.
- v0.6.0+: attach `install.sh` and `install.ps1`, download both back, and verify they match the repo scripts:

```bash
gh release upload "v{version}" install.sh install.ps1 --clobber
tmpdir="$(mktemp -d)"
gh release download "v{version}" --pattern "install.*" --dir "$tmpdir"
shasum -a 256 install.sh install.ps1 "$tmpdir/install.sh" "$tmpdir/install.ps1"
```

- v0.6.0+: the Install section shows the recommended installer path only; native, direct CLI, and `okfh bootstrap` commands link to docs. When short URLs are configured, confirm `https://okf-harness.dev/install.sh` and `https://okf-harness.dev/install.ps1` serve the same assets.
- Body follows the template below and states important non-goals and unchanged boundaries.

## Final release proof

Evidence layers: source diff, tests and CI, generated metadata, packed package contents, GitHub tag, GitHub Release, downloaded installer assets (when included), marketplace add/install smokes, `@pumblus/okf-harness` inspection, OpenCode host install smoke or gap, Pi / Hermes Agent / OpenClaw host install smokes or manual gaps, npm registry versions and dist-tags, documented install commands, clean-environment smokes. If any layer is missing, say exactly what is missing.

## Release template

**Title**: `v{version} {title}` — a short one-to-three-word playful motif, not a literal summary. It should feel slightly mysterious on first read and become clear after the release notes. Each `v0.x.0` introduces a new motif; patch releases in the same minor series continue, evolve, or riff on it. Example: `v0.4.0 Lights On` — the release turns on the Evidence Brief workflow, giving agents bounded wiki evidence before they answer.

**Body**:

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
