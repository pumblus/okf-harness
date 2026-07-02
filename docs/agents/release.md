# Release Agent Checklist

Use this checklist only when preparing, validating, or writing up a public OKF Harness release. The root `AGENTS.md` owns the release note style; this file owns operational release proof.

## Release principle

A release is not shipped until source state, GitHub state, npm registry state, package contents, and documented install paths are all verified together. Missing evidence is an explicit gap, not an implied pass.

## Preflight

- Confirm the user explicitly asked for release, publish, tag, or GitHub Release work in the current turn.
- Check the tree:

```bash
git status --short
```

- Verify GitHub auth, target repository, git remote, current branch, and `HEAD`.
- Keep Issues and GitHub Actions CI enabled.
- Maintain canonical labels from `docs/agents/triage-labels.md`.
- Use squash merge only.
- Keep automatic deletion of merged head branches enabled.
- Keep Projects, Discussions, Wiki, and Dependabot disabled unless intentionally adopted.

## Public leak gates

Before public release, confirm these private/internal files are not tracked:

```bash
git ls-files docs/implementation.md docs/okf-harness-intro.html docs/okf-harness-intro.pdf
```

This command must print nothing. Then scan tracked files for:

- private local paths
- local URLs
- ignored override files
- internal document references
- credentials or tokens
- unpublished planning notes

## Version and package manifest gates

- Publish only explicitly public package directories.
- Never publish the root package or private workspace packages.
- No `workspace:` protocol entries in publishable manifests.
- Internal package dependencies must point at the same public package version.
- `pnpm-workspace.yaml` must link matching workspace packages locally.
- Publishable packages must declare the project runtime engine.
- Publishable packages must run `pnpm run build` from `prepublishOnly`.
- Publishable package `files` allowlists must include only build output, package metadata, package-local README files, and runtime assets explicitly required by the package.
- `pnpm-lock.yaml` owns dependency resolution state only. Do not hand-edit it; update it through pnpm when package manifests change.

## npm auth and registry gates

Before publishing:

```bash
npm whoami
```

Verify:

- package ownership
- registry access
- current registry state
- whether a package is unpublished versus blocked by permission errors

## npm preflight

Inspect packed package contents, then run:

```bash
pnpm smoke:tarball
```

The smoke script owns:

- package list
- tarball install checks
- host CLI checks
- release checklist coverage gaps

## npm publish flow

- Publish from each public package directory.
- Use dependency order.
- Use:

```bash
npm publish --access public
```

- Use the default release dist-tag.
- Do not enable npm provenance unless the release workflow explicitly adopts and verifies it.

## npm post-publish proof

After publishing:

- Verify registry versions.
- Verify the documented CLI install path when the release still documents one.
- Verify documented setup package install paths when available in the release environment.
- Verify documented native host integration install paths when available in the release environment.
- Do not claim shipped if any documented install command fails.

## GitHub Release

- Use the repository tag convention: `v{version}`.
- Create no public `RELEASE.md`.
- Before the v0.6 installer workflow ships, attach no extra release assets unless the release workflow intentionally adopts them.
- Before the v0.6 installer workflow ships, keep the Install section to:

```bash
npm install -g @okf-harness/cli
okfh doctor --json
```

- For v0.6.0 and later, attach `install.sh` and `install.ps1`, download both assets back, and verify they resolve to the intended setup version.
- For v0.6.0 and later, keep the Install section to the recommended installer path. Do not list native, direct CLI, or `okfh bootstrap` commands there; link to docs for those.
- Use the release title/body template from the root `AGENTS.md`.
- Ensure the release body states important non-goals and unchanged boundaries when they matter.

Installer asset commands for v0.6.0 and later:

```bash
gh release upload "v{version}" install.sh install.ps1 --clobber
tmpdir="$(mktemp -d)"
gh release download "v{version}" --pattern "install.*" --dir "$tmpdir"
shasum -a 256 install.sh install.ps1 "$tmpdir/install.sh" "$tmpdir/install.ps1"
```

The downloaded asset hashes must match the repository script hashes. After the short installer URLs are configured, also confirm `https://okf-harness.dev/install.sh` and `https://okf-harness.dev/install.ps1` serve the same release assets before claiming the latest installer path is live.

## Final release proof

Before saying the release is done, separate the evidence layers:

- source diff
- tests and CI
- generated metadata
- packed package contents
- GitHub tag
- GitHub Release
- downloaded installer assets when the release includes them
- npm registry versions
- npm dist-tags
- documented install commands
- clean-environment smoke checks

If any layer is missing, say exactly what is missing.
