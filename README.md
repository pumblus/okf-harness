# OKF Harness

[![CI](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![Local terminal](https://img.shields.io/badge/platform-local%20terminal-lightgrey.svg)](docs/CLI.md)

English | [中文](README.zh-CN.md)

An agent-first, local-first, terminal-native harness for maintaining OKF-compatible LLM Wikis from Claude Code, Codex, and future coding agents.

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
Claude Code or Codex uses okfh evidence/read/graph
```

OKF Harness does not ask you to learn a new knowledge-base app. You install one CLI package, create one local workspace per knowledge domain, then ask Claude Code or Codex to add sources, maintain the wiki, and answer from it.

## Origins

OKF Harness builds on:

- Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the agent-maintained wiki pattern of index, log, linked pages, ingest, query, and lint.
- Google's [Open Knowledge Format announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) and [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md): the markdown-plus-frontmatter bundle shape that keeps knowledge portable across tools.

This repository is not affiliated with or endorsed by Andrej Karpathy or Google.

## Before You Start

Install the CLI once:

```bash
npm install -g @okf-harness/cli
```

Normal use needs macOS, Windows, or Linux; Node.js 22 or newer; git; and the `@okf-harness/cli` package. Repository development additionally needs `pnpm`.

You can run that command yourself, or ask your agent to check whether `okfh` is installed. If an agent needs to install a global npm package, it must ask for your explicit approval first.

Package installation best-effort installs managed global bootstrap entrypoints for detected Codex and Claude Code clients. If that cannot complete, package installation still succeeds and troubleshooting can use `okfh doctor --json`.

After installation, the ordinary first-start flow is a prompt to your current agent, then a refresh into the workspace-local `okf-harness` entrypoint.

The recommended parent folder is only a convention, not a hidden CLI default. On macOS or Linux, use `$HOME/Documents/OKF Harness`. On Windows PowerShell, use `$env:USERPROFILE\Documents\OKF Harness`. On Command Prompt, use `%USERPROFILE%\Documents\OKF Harness`.

## Start With Your Agent

Use the prefix for the agent you are already using. Before a workspace exists, start with the low-frequency global bootstrap entrypoint. After setup or selection, work inside the workspace with the workspace-local entrypoint.

No workspace yet:

Codex:

```text
$okf-harness-bootstrap Set up a workspace for my AI research notes in my Documents folder, then tell me how to refresh this agent context.
```

Claude Code:

```text
/okf-harness-bootstrap Set up a workspace for my AI research notes in my Documents folder, then tell me how to refresh this agent context.
```

Inside a workspace:

Codex:

```text
$okf-harness Check this workspace and tell me whether it is ready.
```

Claude Code:

```text
/okf-harness Check this workspace and tell me whether it is ready.
```

Bootstrap can also discover or select a workspace from a local workspace collection and repair current-agent setup for the selected workspace. It does not synthesize wiki content, migrate non-empty non-workspace folders, or write global root guidance files.

For a transient diagnostic command:

```bash
npx --package @okf-harness/cli okfh doctor --json
```

This does not add a global `okfh` binary, but npm may still run package install hooks while preparing the temporary package.

## Common Next Steps

Add a source:

Codex:

```text
$okf-harness Add this PDF to my workspace, update the wiki with citations, then check the workspace again.
```

Claude Code:

```text
/okf-harness Add this PDF to my workspace, update the wiki with citations, then check the workspace again.
```

Ask a question:

Codex:

```text
$okf-harness What does my workspace say about LLM Wiki structure?
```

Claude Code:

```text
/okf-harness What does my workspace say about LLM Wiki structure?
```

## Why

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
- Installs workspace guidance for Claude Code or Codex.
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

If `$okf-harness-bootstrap` or `/okf-harness-bootstrap` is missing, stale, or blocked by an unmanaged same-name skill, run:

```bash
okfh doctor --json
```

`doctor` reports global bootstrap status even before a workspace is selected. Use `okfh bootstrap status|repair --agents codex|claude|all --json` only as diagnostic or repair tooling; the primary first-setup workflow is the agent prompt above.

## Docs

- [Workflows](docs/WORKFLOWS.md) explains the user-facing Claude Code and Codex flows, including the first-start check.
- [CLI reference](docs/CLI.md) lists commands, options, and JSON behavior.
- [Roadmap](docs/ROADMAP.md) shows the current focus and demand-ranked ideas.
- [LLM context](llms.txt) gives AI tools a concise map of the public project docs.
- [Full LLM context](llms-full.txt) combines the public overview, terminology, workflows, CLI reference, roadmap, and package READMEs.
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

Thanks also to Tw93's [Waza](https://github.com/tw93/waza) and Matt Pocock's [Skills for Real Engineers](https://github.com/mattpocock/skills) for shaping the development workflow behind this project.

## License

Apache-2.0. See [LICENSE](LICENSE).
