# OKF Harness

[![CI](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](docs/ROADMAP.md)

English | [中文](README.zh-CN.md)

A macOS-first, agent-first local harness for maintaining OKF-compatible LLM Wikis from Claude Code, Codex, and future coding agents.

OKF Harness is an independent open-source project built on two upstream ideas: [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern for agent-maintained living wikis, and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) for portable markdown knowledge bundles.

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
Claude Code or Codex uses okfh search/read/graph
```

OKF Harness does not ask you to learn a new knowledge-base app. You install one CLI package, create one local workspace per knowledge domain, then ask Claude Code or Codex to add sources, maintain the wiki, and answer from it.

## Origins

OKF Harness builds on:

- [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the agent-maintained wiki pattern of index, log, linked pages, ingest, query, and lint.
- Google's [Open Knowledge Format announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) and [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md): the markdown-plus-frontmatter bundle shape that keeps knowledge portable across tools.

This repository is not affiliated with or endorsed by Andrej Karpathy or Google.

## Quick Start

Install the CLI:

```bash
npm install -g @okf-harness/cli
okfh doctor --json
```

Create your first workspace:

```bash
mkdir -p "$HOME/Documents/OKF Harness"
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents all --git --json
cd "$HOME/Documents/OKF Harness/ai-research"
```

Open that folder in Claude Code or Codex and say:

```text
Use OKF Harness to add ~/Downloads/paper.pdf to this workspace, create an ingest plan, and update the wiki with citations.
```

To try the command without a global install:

```bash
npx --package @okf-harness/cli okfh doctor --json
```

## Why

Most personal knowledge tools make the app the center. OKF Harness makes the local folder the center:

- raw source material stays inspectable under `raw/sources/`
- synthesized knowledge lives in ordinary markdown under `wiki/`
- citations connect topic pages back to reference pages and source IDs
- `okfh --json` gives agents a deterministic tool surface
- the graph report is a local HTML file, not a hosted service

The recommended layout is one workspace per knowledge domain, research area, or privacy boundary. Keep them under `~/Documents/OKF Harness/` unless you have a reason to separate them.

The product stays narrow on purpose: local files, terminal-native commands, bounded reads, and explicit provenance come first. Broader surfaces such as GUI, cloud sync, Obsidian helpers, source connectors, vector retrieval, and cross-platform support belong in the roadmap only when they preserve those guarantees.

## What It Does

- Initializes a local OKF Harness workspace for macOS.
- Installs Claude Code and Codex guidance into the workspace.
- Registers files and URL pointers as raw sources.
- Produces ingest plans so an agent can update the wiki with citations.
- Searches and reads synthesized wiki pages with bounded output.
- Lints links, frontmatter, citations, source hashes, and manifest rows.
- Generates a self-contained graph report.

## Common Workflows

Ask your agent:

```text
Set up an OKF Harness workspace for my AI research notes under ~/Documents/OKF Harness. Use the default structure and install Claude and Codex support.
```

```text
Add this source to my AI Research workspace, then update the relevant topic page with citations.
```

```text
What does my AI Research wiki say about LLM Wiki structure? Use OKF Harness search and read before answering.
```

```text
Check this workspace for broken links, missing citations, and source hash drift.
```

Developers can use the same tool directly:

```bash
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read topics/llm-wiki --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

## Docs

- [Workflows](docs/WORKFLOWS.md) explains the user-facing Claude Code and Codex flows.
- [CLI reference](docs/CLI.md) lists commands, options, and JSON behavior.
- [Roadmap](docs/ROADMAP.md) shows the current focus and demand-ranked ideas.
- [Example workspace](examples/ai-research-workspace/README.md) gives a small lintable workspace.
- [Contributing](CONTRIBUTING.md) explains project scope and verification.
- [Security](SECURITY.md) explains local data boundaries and reporting.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

See [CONTEXT.md](CONTEXT.md) for the project glossary and [docs/adr](docs/adr) for architecture decisions.

## Acknowledgements

Thanks to Andrej Karpathy for publishing the LLM Wiki pattern, and to Google for publishing Open Knowledge Format as a simple, portable shape for markdown knowledge bundles. OKF Harness adapts those ideas for a local, agent-first workflow.

Thanks also to [Tw93's Waza](https://github.com/tw93/waza) and [Matt Pocock's Skills for Real Engineers](https://github.com/mattpocock/skills) for shaping the development workflow behind this project.

## License

Apache-2.0. See [LICENSE](LICENSE).
