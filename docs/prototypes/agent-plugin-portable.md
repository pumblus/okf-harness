# Prototype: portable Agent Plugin package

**Throwaway.** This branch (`prototype/agent-plugin-portable`) exists to answer issue #123 for the [Agent Plugins wayfinder map](https://github.com/pumblus/okf-harness/issues/117). Nothing here is meant to merge: the real package is rendered by `packages/agent-pack`, not hand-written.

## Question

Turn the decisions of #121 (package shape and channel) and #122 (portable SKILL.md content) into a real directory, and see what only shows up on contact.

## What was built

`plugins/portable/okf-harness/` — hand-written, user-facing:

- `plugin.json` — nine fields, validated against the official 1.0.0 schema with `ajv` (`valid`).
- `README.md` — written for the person installing it: what they get, what they need, one install recipe per client, how to tell it worked, how to remove it.
- `skills/okf-harness/SKILL.md` + `references/{setup,discovery,repair}.md` — the shared body with the portable profile's substitutions.

## Findings

1. **`skills` and `interface` cannot travel.** Both shipped manifests carry `"skills": "./skills/"`, and the Codex one carries a whole `interface` block. The Agent Plugins manifest schema is closed at ten top-level fields and includes neither; `skills/` is a fixed location the manifest may not restate. Host-owned data like `interface` belongs in an `extensions` namespace or nowhere. Decided: nowhere.
2. **The package has no shopfront of its own.** Dropping `interface` removes the display name, category, and default prompt a user sees in a client's plugin list. All the portable package can offer a human is `description` plus a root `README.md` — so both must read like product copy, not repo copy.
3. **Name collision at the marketplace.** `.agents/plugins/marketplace.json` already declares a plugin named `okf-harness` sourced from `./plugins/codex/okf-harness`. Point Codex at this repo and it installs the per-host variant; the portable directory is unreachable through that entry. One repo cannot expose two plugins under one name — this is a live constraint for #124, not a rendering detail.
4. **A package in a subdirectory is not a `owner/repo` install.** Copilot CLI and Codex probe for a manifest at the *repository root*. `plugins/portable/okf-harness/` is only reachable by local path or by a marketplace entry that names the path — which is why the README's recipes all start with a clone.
5. **The repair route grew a branch that no per-host variant has.** On an unrecognised client there is no guidance target at all, so repair reports "nothing to install" and falls through to the daily routes. That branch is new surface, and it is #125's題面, not this prototype's.

## Verdict

The decisions survive contact — the package validates and reads coherently. What the prototype adds is finding 3: the Codex convergence question is a naming conflict inside one repository, sharper than "how do the two distributions relate".
