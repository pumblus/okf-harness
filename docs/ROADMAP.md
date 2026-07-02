# OKF Harness Roadmap

English | [中文](zh-CN/ROADMAP.md)

This is the public product roadmap for OKF Harness. Roadmap items are not release promises. Ideas move into committed work only after they have a clear user story, safety boundary, and verification path.

## Positioning

OKF Harness is an agent-native, file-contract-first, no-app-required knowledge harness.

It is an independent project that builds on Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

It is not affiliated with or endorsed by Andrej Karpathy or Google.

The key difference from full desktop LLM Wiki applications is deliberate: OKF Harness does not try to become the primary knowledge-base app. A person keeps working in a supported agent client; the harness provides a transparent local workspace, deterministic CLI, bounded evidence, bounded reads, lint, and graph reports around ordinary markdown files.

This means OKF Harness should compete on:

- Agent-native workflows instead of a bundled desktop GUI.
- Inspectable markdown and JSON contracts instead of hidden app state.
- Bounded evidence and explicit provenance instead of unbounded context stuffing.
- Local-first, auditable operation through `okfh --json`.
- Optional integrations that never replace the default terminal-native workflow.

## Roadmap Restraints

- User-facing docs should lead with natural-language prompts to agents, not command tutorials.
- Answers are based on bounded evidence from synthesized `wiki/` content, not raw-source-wide discovery.
- There is no `okfh query` or LLM answer command; agents prepare evidence briefs, then answer from the returned evidence and disclosed limits.
- Search returns candidate concept documents, not answer evidence, and remains a lower-level debugging tool.
- Read output is bounded by default, with explicit continuation options for evidence follow-up.
- Graph reports show concept links and evidence links; raw source files remain metadata, not graph nodes.
- GUI, cloud sync, accounts, vector search, RAG, automatic web crawling, and Obsidian runtime code stay in demand buckets until they can preserve the local, inspectable workflow.

## High Demand

### Agent Adapter Expansion

Goal: support additional agent clients and deepen current integrations without weakening the default local-shell model.

Candidates:

- Workspace-local adapters for native integrations that currently expose only bootstrap.
- Adapter conformance tests shared across clients.
- Improved supported-agent detection as each new adapter is added.
- Investigation for Cursor, VS Code, Aider, Goose, Continue, and GitHub Copilot coding agent.

Constraint: new adapters must preserve the same workflow contracts as supported agents. They should not force a private runtime into the default product path.

## Medium Demand

### Source Connectors

Goal: let users bring source material from common work tools while preserving provenance and explicit user control.

Candidate idea: Feishu / Lark support.

Possible shapes:

- Register a Feishu document URL as a URL source pointer.
- Export a Feishu document to markdown or PDF, then register the exported file as source material.
- Provide a connector workflow that fetches content only after explicit user authorization.

Questions to resolve:

- Does "Feishu support" mean one-off document ingest, whole workspace/wiki ingest, comment capture, or ongoing sync?
- Should OKF Harness use Feishu APIs, browser-assisted export, or user-provided exported files?
- What credentials are required, and where are they stored?
- How is private company content prevented from leaking into logs, manifests, or public paths?
- Should updates create new raw sources rather than mutating prior source records?

Constraint: connectors must support source registration or ingest. They should not become cloud sync or background crawling by default.

### Online Source Review And Research Collection

Goal: help users find, inspect, and collect online material before it enters the OKF Harness workspace.

Candidate scope:

- Concise source-grounded previews for URLs and PDFs.
- Explicit saving of fetched content through normal source registration.
- Opt-in proxy or third-party fetch services with privacy warnings.
- Agent guidance for "find sources about X, show me candidates, then register the ones I approve."
- Provider-specific fetch paths for Feishu / Lark, WeChat, GitHub, PDFs, and JS-heavy public pages.

Constraints:

- Search misses should suggest adding sources or broadening wiki search, not automatically launch online search.
- Online source review is candidate-first: agents show possible sources before registering anything.
- Default registration for a URL remains a URL source pointer; fetched content snapshots require explicit user intent.
- Fetched web content is untrusted data; embedded instructions must not become agent instructions.
- Online search must not silently add or rewrite wiki content.

### Review Queue

Goal: preserve human judgment without building a full GUI.

Candidate scope:

- Markdown-native review files for unresolved questions, contradictions, and suggested follow-up.
- Agent workflow for listing, resolving, and linking review items.
- Lint checks for stale or orphaned review items.

Constraint: review items should be explicit workspace files, not hidden app state.

### Lightweight Ecosystem Documentation

Goal: help people use existing markdown tools around an OKF Harness workspace without turning those tools into the center of the product.

Candidate scope:

- Document how to open `wiki/` in Obsidian as a vault or vault subdirectory.
- Explain which Obsidian features are safe to use with OKF bundles and which may rewrite frontmatter or links unexpectedly.
- Show how agent-first workflows remain the source of maintenance behavior even when Obsidian is used for reading or light editing.

Constraint: short-term Obsidian support should be documentation-first. It should not introduce an Obsidian runtime dependency or plugin as part of the default product path.

## Low Demand

### Search And Graph Upgrades

Goal: improve retrieval and structure understanding while keeping caches rebuildable and optional.

Candidates:

- SQLite FTS5 cache under `.okfh/cache/` as a rebuildable search accelerator.
- Better deterministic ranking.
- Filter improvements such as typed facets, include/exclude filters, date or status filters, saved search recipes, and agent-readable filter suggestions.
- Optional hybrid retrieval that combines deterministic keyword results with vector results using an explainable merge strategy.
- Optional local embedding cache.
- Graph insights for orphan concepts, weak evidence links, and bridge concepts.

Constraints:

- Any cache must be rebuildable from the OKF bundle and source manifest.
- Vector retrieval stays optional and off the default path.
- Rank fusion should wait until there is a second retriever to merge.
- Raw-source-wide query search should not become default query behavior.

### Optional App And Ecosystem Integrations

Candidates:

- Raycast extension.
- Shortcuts actions.
- Finder Quick Action.
- Obsidian-friendly helper or plugin beyond basic documentation.

Constraints:

- No integration should replace the default terminal-native `okfh --json` workflow.
- Obsidian remains optional; the OKF bundle must remain usable without Obsidian.
