# OKF Harness Agent Plugin

OKF Harness is an agent-first, local-first, terminal-native harness for maintaining OKF-compatible local LLM wikis through coding agents. This directory is the portable Agent Plugin form of the OKF Harness native agent integration: one package that any agent client conforming to the [Agent Plugins standard](https://agent-plugins.org/) can install.

Installing it adds the unified `okf-harness` host-level entrypoint as a skill. Ask your agent to set up a workspace, check it, ingest sources, reconcile revisions, answer from the wiki, or graph it — the entrypoint routes each request and runs the Harness runtime through the runtime launcher, pinned to your workspace's runtime pin.

## Install

Install this directory the way your agent client installs Agent Plugins packages:

- **Codex** — the documented path: `codex plugin marketplace add pumblus/okf-harness --json`, then `codex plugin add okf-harness@okf-harness --json`.
- **Any other conforming client** — point the client's local Agent Plugin directory at a copy of this directory. The package lives at `plugins/agent-plugins/okf-harness` in a clone of the [repository](https://github.com/pumblus/okf-harness).

Claude Code, Codex, OpenCode, Pi, Hermes Agent, and OpenClaw are the supported agent set; for them, universal setup is the recommended way to get a host-level entrypoint. Clients outside that set can install this package by hand, but they are not in the supported agent set: no OKF Harness installer updates a hand-installed copy, so compare the version in `plugin.json` with the latest [release](https://github.com/pumblus/okf-harness/releases) to tell when your copy is stale.

## What is inside

- `plugin.json` — the Agent Plugins 1.0 manifest: identity, license, and the `com.openai` storefront extension.
- `skills/okf-harness/` — the unified host-level entrypoint skill with its setup, discovery, and repair references.

## License

Apache-2.0 — see the repository [LICENSE](https://github.com/pumblus/okf-harness/blob/main/LICENSE).
