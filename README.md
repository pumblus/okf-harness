# OKF Harness

[![CI](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![Local terminal](https://img.shields.io/badge/platform-local%20terminal-lightgrey.svg)](docs/CLI.md)
[![BundleDex](https://bundledex.net/badge/okf-harness.svg)](https://bundledex.net/bundles/okf-harness/)

English | [中文](README.zh-CN.md)

An agent-first, local-first, terminal-native harness for maintaining OKF-compatible LLM Wikis.

OKF Harness is an independent open-source project built on two upstream ideas: Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern for agent-maintained living wikis, and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) for portable markdown knowledge bundles.

```text
source files or URLs
        |
        v
raw/sources + .okfh/manifest.jsonl
        |
        v
wiki/*.md with citations
        |
        v
supported agents use okfh evidence/read/graph
```

OKF Harness does not ask you to learn a new knowledge-base app. You run setup once for the agents you use, create one local workspace per knowledge domain, then ask your agent to add sources, maintain the wiki, and answer from it.

## Origins

OKF Harness builds on:

- Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the agent-maintained wiki pattern of index, log, linked pages, ingest, query, and lint.
- Google's [Open Knowledge Format announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) and [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md): the markdown-plus-frontmatter bundle shape that keeps knowledge portable across tools.

This repository is not affiliated with or endorsed by Andrej Karpathy or Google.

## Before You Start

If you're on macOS or Linux, run this script:

```bash
curl -fsSL https://okf-harness.dev/install.sh | sh
```

In Windows PowerShell, run this instead:

```powershell
irm https://okf-harness.dev/install.ps1 | iex
```

Already have Node.js 22 or newer?

```bash
npx @okf-harness/setup@latest
```

Normal use needs Node.js 22 or newer; git; the shared `okfh` runtime; and at least one supported agent integration. Repository development additionally needs `pnpm`.

Setup installs or updates the shared global `okfh` runtime after confirmation, detects supported agent clients, and installs the selected native integrations. Direct native install paths are available for users who already know their agent:

| Agent | Native install command |
|---|---|
| Claude Code | `claude plugin marketplace add pumblus/okf-harness && claude plugin install okf-harness@okf-harness` |
| Codex | `codex plugin marketplace add pumblus/okf-harness --json && codex plugin add okf-harness@okf-harness --json` |
| OpenCode | `opencode plugin @pumblus/okf-harness --global` |
| Pi | `pi install npm:@pumblus/okf-harness` |
| Hermes Agent | `hermes skills tap add pumblus/okf-harness && hermes skills install pumblus/okf-harness/okf-harness` |
| OpenClaw | `openclaw skills install @pumblus/okf-harness --global` |

Advanced direct CLI runtime installation is documented in the CLI reference. It does not write agent bootstrap entrypoints.

After setup, start from the global bootstrap entrypoint in your current agent. If that agent has workspace-local guidance, the bootstrap handoff tells you how to refresh into the workspace-local `okf-harness` entrypoint.

The recommended parent folder is only a convention, not a hidden CLI default. On macOS or Linux, use `$HOME/Documents/OKF Harness`. On Windows PowerShell, use `$env:USERPROFILE\Documents\OKF Harness`. On Command Prompt, use `%USERPROFILE%\Documents\OKF Harness`.

## Start With Your Agent

Use the OKF Harness entrypoint name exposed by the agent you already use. The entrypoint name is stable; the calling syntax belongs to the agent. Codex usually uses `$okf-harness`, Claude Code usually uses `/okf-harness`, and other native integrations expose the same entrypoint name through their own skill or plugin UI.

When copying a prompt below, replace the bracketed entrypoint with your agent's actual invocation.

```text
<okf-harness-bootstrap> Set up a workspace for my AI research notes in my Documents folder, then tell me how to refresh this agent context.
```

After setup or workspace selection, work inside the workspace with the workspace-local entrypoint:

```text
<okf-harness> Check this workspace and tell me whether it is ready.
```

Bootstrap can also discover or select a workspace from a local workspace collection and repair current-agent setup for the selected workspace. It does not synthesize wiki content, migrate non-empty non-workspace folders, or write global root guidance files.

For a transient diagnostic command:

```bash
npx --package @okf-harness/cli okfh doctor --json
```

This does not add a global `okfh` binary.

## Common Next Steps

Add a source:

```text
<okf-harness> Add this PDF to my workspace, update the wiki with citations, then check the workspace again.
```

Ask a question:

```text
<okf-harness> What does my workspace say about LLM Wiki structure?
```

## Why OKF Harness

Most personal knowledge tools make the app the center. OKF Harness makes the local folder the center:

- raw source material stays inspectable under `raw/sources/`
- synthesized knowledge lives in ordinary markdown under `wiki/`
- citations connect topic pages back to reference pages and source IDs
- `okfh --json` gives agents a deterministic tool surface
- the graph report is a local HTML file, not a hosted service

The recommended layout is one workspace per knowledge domain, research area, or privacy boundary. Keep them under a local `Documents/OKF Harness/` folder unless you have a reason to separate them.

The product stays narrow on purpose: local files, terminal-native commands, bounded evidence, bounded reads, and explicit provenance come first. Broader surfaces such as GUI, cloud sync, Obsidian helpers, source connectors, and vector retrieval belong in the roadmap only when they preserve those guarantees.

## What It Does

- Initializes a local OKF Harness workspace.
- Installs supported workspace guidance for agents with workspace adapters.
- Registers files and URL pointers as raw sources.
- Produces ingest plans so an agent can update the wiki with citations.
- Prepares bounded evidence briefs from synthesized wiki pages before answers.
- Searches and reads synthesized wiki pages for debugging and bounded continuation.
- Checks OKF conformance and Harness lint findings.
- Generates a self-contained graph report.

## What Happens Behind The Scenes

The agent uses `okfh --json` through your local shell. For example:

- first setup uses the global bootstrap entrypoint to resolve the workspace collection, confirm writes, call `okfh init` with the current agent adapter, and return agent context refresh guidance
- ingest calls `okfh source add` and `okfh ingest plan`
- answers use `okfh evidence`, then at most one bounded `okfh read` when a continuation cue is needed
- validation uses `okfh check`
- graph reports use `okfh graph`

Developers can call the CLI directly when they need to script or debug a workspace:

```bash
okfh check --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read topics/llm-wiki --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

## Troubleshooting

If the `okf-harness-bootstrap` entrypoint is missing, stale, or blocked by an unmanaged same-name skill, run:

```bash
okfh doctor --json
```

`doctor` reports runtime, native integration, legacy bootstrap fallback, and workspace checks separately. Use `okfh bootstrap status|repair --agents codex|claude|all --json` only as advanced legacy fallback repair tooling for Claude/Codex adapters; the primary first-setup workflow is setup plus the agent prompt above.

## Docs

- [Workflows](docs/WORKFLOWS.md) explains the user-facing agent flows, including the first-start check.
- [CLI reference](docs/CLI.md) lists commands, options, and JSON behavior.
- [Roadmap](docs/ROADMAP.md) shows the current focus and demand-ranked ideas.
- [Example workspace](examples/ai-research-workspace/README.md) gives a small lintable workspace.
- [Contributing](CONTRIBUTING.md) explains project scope and verification.
- [Security](SECURITY.md) explains local data boundaries and reporting.

## Development

```bash
pnpm install
pnpm docs:llms
pnpm test
pnpm typecheck
pnpm build
```

See [CONTEXT.md](CONTEXT.md) for the project glossary and [docs/adr](docs/adr) for architecture decisions.

## Acknowledgements

Thanks to Andrej Karpathy for publishing the LLM Wiki pattern, and to Google for publishing Open Knowledge Format as a simple, portable shape for markdown knowledge bundles. OKF Harness adapts those ideas for a local, agent-first workflow.

Thanks also to Tw93's [Waza](https://github.com/tw93/waza) and Matt Pocock's [Skills for Real Engineers](https://github.com/mattpocock/skills) for shaping the development behind this project.

## License

Apache-2.0. See [LICENSE](LICENSE).
