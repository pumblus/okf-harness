# OKF Harness Roadmap

English | [中文](zh-CN/ROADMAP.md)

This is the public product roadmap for OKF Harness. The detailed implementation phase gate remains `docs/implementation.md` section 11.2; this file records release direction, accepted themes, and candidate ideas.

Roadmap items are not release promises. Ideas move from the inbox into a release only after they have a clear user story, safety boundary, and verification path.

## Positioning

OKF Harness is an agent-native, file-contract-first, no-app-required knowledge harness.

The key difference from full desktop LLM Wiki applications is deliberate: OKF Harness does not try to become the primary knowledge-base app. A person keeps working in Claude Code, Codex, and future agent clients; the harness provides a transparent local workspace, deterministic CLI, bounded evidence packs, lint, and graph reports around ordinary markdown files.

This means OKF Harness should compete on:

- Agent-native workflows instead of a bundled desktop GUI.
- Inspectable markdown and JSON contracts instead of hidden app state.
- Bounded evidence and explicit provenance instead of unbounded context stuffing.
- Local-first, auditable operation through `okfh --json`.
- Optional integrations that never replace the default terminal-native workflow.

## Current Release: v0.1 Agent-First Local MVP

Goal: make OKF Harness useful from Claude Code and Codex without requiring a separate app, MCP server, vector database, or GUI.

Included:

- macOS-first workspace initialization.
- Claude Code and Codex agent adapters.
- Source registration with raw source immutability and manifest integrity.
- Metadata-level ingest planning.
- Deterministic wiki search and read.
- Self-contained local graph report.
- Terminal-native hardening and release documentation.

Phase 5 query/read/graph decisions:

- Query answers are based on synthesized `wiki/` content, not raw-source-wide discovery.
- v0.1 does not implement `okfh query` or an LLM answer command. Agent skills compose `search` and `read`; bounded `query plan` belongs to v0.2.
- Phase 5 should keep implementation boundaries small: separate core modules for search, read, and graph; shared helpers only for workspace resolution and markdown link parsing; no generic query engine abstraction in v0.1.
- The CLI should stay a thin adapter around core behavior, responsible for arguments, JSON envelopes, and minimal human output.
- Search, read, and graph commands should resolve the workspace from explicit `--workspace` or the nearest `okfh.config.yaml`, and JSON should always report the resolved workspace.
- Search, read, and graph JSON should share the standard CLI envelope: `ok`, `command`, `workspace`, `data`, `warnings`, and `next`. Command-specific payloads belong under `data`, so agent adapters do not need per-command top-level parsing rules.
- Failed search, read, and graph JSON should use the same envelope with `ok:false`, empty `data`, user-facing `next` steps, and `error: { code, message, details? }`. Phase 5 error codes should include workspace, target, section ambiguity, read limit, encoding, config, scan, and graph write failures.
- Non-JSON terminal output should stay minimal and readable, not become a TUI or second contract. Search can print a ranked list with paths and types; read can print title, path, truncation status, and returned content; graph can print report paths and an open hint; failures can print one plain-language message plus a next step. The stable machine contract remains `--json`.
- Phase 5 should extend the same resolution behavior to read-only or maintenance commands such as status and lint. Evidence-changing workflows such as source add and ingest plan should remain explicit until terminal-native hardening revisits the safety model, so users do not register sources into the wrong workspace.
- `okfh status --json` should expose a capability summary after Phase 5: search, read, and graph are available, while `queryCommand` remains not available. This lets agents choose the search/read workflow instead of hallucinating an `okfh query` command.
- Search returns candidate concept documents, not answer evidence.
- Search includes Reference documents because they are concept documents and evidence bridges.
- Search does not return body snippets by default.
- v0.1 search may borrow the field-scoring shape used by mature LLM Wiki tools: title/id/path/tag/type hits should rank above body hits, while staying deterministic and wiki-only.
- The initial v0.1 scoring weights are concrete but adjustable: exact title/id/path +100; title phrase +60; id/path phrase +50; exact tag +40; type +25; description phrase +20; title token +12; id/path token +10; tag token +8; description token +4; body phrase +4; body token +2, each with caps defined in the implementation spec.
- Search tokenization should support English token matching and simple CJK unigram/bigram matching without adding a tokenizer dependency. A small stop-word list may affect token scoring, but not phrase matching.
- Search results should include `scoreBreakdown` so agents and developers can inspect why a result ranked where it did.
- Search results should remain thin candidate cards, not evidence payloads. Each `data.results[]` item should include `conceptId`, `path`, `title`, `type`, `tags`, `description`, `frontmatterOk`, `indexMentioned`, `score`, `scoreBreakdown`, `matchedFields`, and `bodyHitCount`, but no body snippet by default.
- Search defaults to 10 results and allows up to 50 when an agent explicitly needs broader review.
- v0.1 search supports minimal filters: `type:<value>`, `tag:<value>`, and `path:<prefix>`, while avoiding a complex query DSL.
- Search JSON should include top-level `data.query`, `data.filtersApplied`, `data.limit`, `data.totalMatches`, `data.truncated`, and `data.results` so agents can explain the actual search scope to non-technical users.
- Search results should include root-index `indexMentioned` as navigation metadata, not as a ranking boost.
- Search should not auto-run full lint; scan problems should be surfaced as warnings unless the workspace cannot be read.
- Search may include readable markdown files with invalid frontmatter, but results must mark degraded metadata.
- Search should cap per-file body scanning with an adjustable initial `maxSearchBodyChars = 200000`; oversized files degrade to metadata/title/path matching with warnings.
- v0.1 should stay out-of-box: search weights, body scan caps, and read preview caps are implementation defaults, not `okfh.config.yaml` user settings. The exposed user controls are request-level choices such as search limit, section reads, range reads, and explicit full reads.
- `read` must be bounded by default. It should return metadata, outline, links, citations, and a limited content object; full or section reads must be explicit.
- Read JSON should use a single `data.content` object for returned text across preview, section, range, and full modes: `mode`, `text`, `startOffset`, `endOffset`, `contentLength`, `returnedChars`, and `truncated`. The top-level `data` payload should keep `target`, `frontmatter`, `metadata`, `outline`, `availableSections`, `links`, `citations`, `citationIssues`, `content`, and optional `source` stable.
- `read` should accept concept IDs and OKF bundle links such as `topics/x`, `wiki/topics/x.md`, and `/topics/x.md`, plus explicit `index` and `log` targets. It must not become an arbitrary workspace file reader.
- `read index` may return parsed `indexLinks` so agents can navigate the homepage without ad hoc markdown parsing.
- `read log` may return parsed log entries for recent activity questions, while remaining a bounded reserved-document read.
- `read` may include source manifest metadata for cited source IDs, but never raw source bodies by default.
- Reading a Reference document should expose its registered source as top-level metadata because the Reference document is the evidence bridge for that raw source.
- Broken citations should appear as read warnings, while lint remains the formal integrity checker.
- Invalid frontmatter should not prevent bounded reads when the markdown body is still readable.
- The initial read preview cap is 12,000 characters. This is an adjustable implementation default, not a permanent protocol guarantee.
- Long document continuation is section-first, range-second: agents should use explicit section reads when headings exist, and offset/limit reads when a document has weak structure.
- Section reads need stable section IDs because heading text can repeat. Ambiguous heading reads should return candidate sections instead of guessing.
- Full reads are explicit opt-in and still bounded. The initial full-read hard cap is 100,000 characters, adjustable after real usage data.
- `wiki/index.md` is an orientation map, not a ranking source. Search may return `indexMentioned: true`, but it should not boost ranking from index presence alone.
- Missing index entries should be lint warnings, not hard OKF errors.
- Broken markdown or OKF bundle links should be lint warnings, with repair left to maintain workflows.
- Missing citation sections should be targeted warnings for content pages, not blanket failures for every concept type.
- Stale timestamp warnings stay out of v0.1 unless a future workspace config defines an explicit staleness policy.
- Large-unsummarized-source warnings stay out of v0.1 and belong with later source audit or evidence-pack work.
- Orphan concept warnings stay out of v0.1 and belong with later graph insights.
- Graph reports show concept links and evidence links. Raw source files remain metadata, not graph nodes.
- Graph generation should not auto-run full lint; graph-specific issues are reported separately.
- Reserved wiki documents such as `wiki/index.md` and `wiki/log.md` are not graph nodes by default.
- `okfh graph --json` should return a bounded summary by default: `data.report.htmlPath`, `data.report.backlinksPath`, `data.stats`, `data.issues`, and `data.missingTargets`. It should not dump full `nodes` and `edges` into terminal JSON by default.
- The complete graph data belongs in `.okfh/backlinks.json`, where edges keep direction for agent and maintenance use. The default HTML view can render links as undirected structure.
- Missing link targets may appear in graph JSON summaries and `.okfh/backlinks.json` issues, but the HTML view should show only valid graph nodes and edges.
- Graph HTML may include light local interaction such as node search, type filtering, and click-to-view metadata. Editing, layout persistence, community detection, and graph insights stay out of v0.1.
- v0.1 graph reports should stay self-contained without remote scripts or heavy graph runtime dependencies.
- Graph generation should overwrite stable report paths by default; timestamped snapshots can be a later opt-in.
- Rebuildable graph artifacts should be ignored by generated workspace git defaults.
- `okfh graph --open` may open the generated report in the macOS default browser, but plain graph generation should not open external UI.
- Phase 5 must update the generated query skill workflow and golden tests so users can ask questions naturally from Claude Code or Codex.
- Query answers should follow an evidence contract: answer directly first, then list supporting concept paths and available source IDs. If only wiki synthesis was read, the answer should say so; if search hits are weak or citations are missing, the answer should state that the knowledge-base evidence is insufficient. Agents must not imply they read raw sources unless they actually did.
- Maintain workflows should not generate graph reports automatically; they may mention graph generation as an available follow-up option.
- Phase 5 acceptance should be workflow-level, not core-only: core tests for search/read/graph logic, CLI e2e tests for JSON envelopes and workspace resolution, and agent-pack golden tests for Claude/Codex query and maintain workflows.
- Phase 5 should add only minimal README examples for the new search/read/graph workflow. Full CLI documentation belongs to the release documentation phase.
- After Phase 5 is implemented and verified, README and AGENTS.md should update their current-state text so users and future agents know search, read, and graph are available. This is documentation synchronization, not a package version bump.
- No vector search, RAG, automatic web crawling, GUI, cloud sync, or MCP-first path in v0.1.

Release documentation direction:

- Use tw93-style project organization as a quality reference: concise positioning, badges, visual signal when useful, clear Why / Features / Quick Start / Usage, docs index, FAQ or troubleshooting, Support, and License.
- Adapt that style to OKF Harness rather than copying it. The README should foreground agent-first workflows, out-of-box setup, inspectable JSON/file contracts, and the shortest useful examples; long command references should live in dedicated docs.

## Next: v0.2 Bounded Evidence Query Pack

Goal: make agent answers reliable without overflowing context.

Candidate scope:

- `okfh query plan <question> --json` or equivalent evidence-pack command.
- Deterministic retrieval budget that caps index, candidate pages, citations, and response headroom.
- Section/range reads for long concept documents.
- Explicit `truncated`, `contentLength`, and continuation metadata.
- Agent guidance that tells Claude Code and Codex how to answer from a bounded evidence pack.
- Tests that prove large wiki pages do not produce unbounded JSON or context payloads.

Non-goals:

- No semantic embedding index by default.
- No persistent search cache or SQLite FTS in v0.1; those belong to later search upgrades.
- No hidden summarization that claims to understand the wiki.
- No raw-source-wide search unless the user explicitly enters an ingest or source-audit workflow.

## Later: Agent Adapter Expansion

Goal: support more agent clients without weakening the default local-shell model.

Candidates:

- Pi adapter.
- OpenCode adapter.
- Adapter conformance tests shared across clients.
- Tier 3 investigation for Cursor, VS Code generic MCP clients, Aider, Goose, Continue, and GitHub Copilot coding agent.

Constraint: new adapters must preserve the same workflow contracts as Claude Code and Codex. They should not force MCP or a private runtime into the default product path.

## Later: Cross-Platform Terminal-Native Support

Goal: extend terminal-native operation beyond macOS when the v0.1 workflow is stable.

Candidate idea: Windows shell command support.

Questions to resolve:

- Which shell is the default target: PowerShell, `cmd.exe`, Git Bash, or Windows Terminal profile detection?
- How should generated agent guidance express commands across macOS and Windows without confusing non-technical users?
- What path rules are needed for drive letters, backslashes, spaces, symlinks, and case-insensitive filesystems?
- Which checks prove Claude Code and Codex can operate through `okfh --json` on Windows?

Constraint: Windows support must not complicate the v0.1 macOS-first release. It should arrive as an explicit cross-platform hardening phase.

## Later: Source Connectors

Goal: let users bring source material from common work tools while preserving provenance and explicit user control.

Candidate idea: Feishu support.

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

Constraint: Feishu must be source registration or ingest support, not cloud sync or background crawling by default.

## Later: Online Source Review and Research Collection

Goal: help users find, inspect, and collect online material before it enters the OKF Harness workspace.

This should borrow workflow ideas from Waza `read` and `learn`, adapted to OKF Harness:

- Fetching a single URL or PDF should default to a concise source-grounded preview, not full-text dumping.
- Saving fetched content as source material must be explicit and should route through normal source registration.
- Proxy or third-party fetch services must be opt-in, with clear privacy warnings.
- Fetched web content is untrusted data; embedded instructions must not become agent instructions.
- Multi-source research should follow a collect → fetch → file → digest shape, with source URLs and contradictions preserved.
- Feishu / Lark, WeChat, GitHub, PDFs, and JS-heavy public pages may need provider-specific fetch paths.

Possible commands or workflows:

- `okfh source preview <url> --json` for bounded metadata and preview before registration.
- `okfh source add <url> --fetch --json` only when the user explicitly wants a content snapshot, not just a URL pointer.
- Agent guidance for "find sources about X, show me candidates, then register the ones I approve."
- A lightweight preview surface may be considered later, but it must remain a review/collection aid rather than a primary knowledge-base GUI.

Constraints:

- This is not v0.1 query behavior.
- Search misses in v0.1 query should suggest adding sources or broadening the wiki search, not automatically launch online search.
- Online source review is candidate-first: agents show possible sources before registering anything.
- Default registration for a URL remains a URL source pointer; fetched content snapshots require explicit user intent.
- Online search must not silently add or rewrite wiki content.
- Background crawling and automatic web research remain out of scope unless explicitly reopened.

## Later: Review Queue

Goal: preserve human judgment without building a full GUI.

Candidate scope:

- Markdown-native review files for unresolved questions, contradictions, and suggested follow-up.
- Agent workflow for listing, resolving, and linking review items.
- Lint checks for stale or orphaned review items.

Constraint: review items should be explicit workspace files, not hidden app state.

## Later: Search and Graph Upgrades

Goal: improve retrieval and structure understanding while keeping caches rebuildable and optional.

Candidates:

- SQLite FTS5 cache under `.okfh/cache/` as a post-v0.1 rebuildable search accelerator.
- Better deterministic ranking.
- Filter improvements such as typed facets, include/exclude filters, date or status filters, saved search recipes, and agent-readable filter suggestions.
- Optional hybrid retrieval that combines deterministic keyword results with vector results using Reciprocal Rank Fusion or another explainable merge strategy.
- Optional local embedding cache.
- Graph insights for orphan concepts, weak evidence links, and bridge concepts.

Constraint: any cache must be rebuildable from the OKF bundle and source manifest. It must not become the source of truth.

Borrowed carefully from `nashsu/llm_wiki`:

- Keep field-aware ranking: title and path hits are stronger than body hits.
- Treat vector retrieval as optional and off the default v0.1 path.
- Use rank fusion only when multiple retrieval systems exist; do not add RRF machinery before there is a second retriever to merge.
- Do not copy raw-source-wide query search into OKF Harness default query behavior.

## Later: Optional App and Ecosystem Integrations

Candidates:

- Raycast extension.
- Shortcuts actions.
- Finder Quick Action.
- Obsidian-friendly helper or plugin.
- Optional MCP integration for clients that require tool discovery.

Constraints:

- No integration should replace the default terminal-native `okfh --json` workflow.
- Obsidian remains optional; the OKF bundle must remain usable without Obsidian.
- MCP remains optional and must not become the v0.1 default path.

## Idea Inbox

Use this section for uncommitted ideas before they have enough shape for a release section.

- Windows shell command support.
- Feishu document/source support.
- Online source review and research collection inspired by Waza `read` / `learn`.
- Bounded evidence packs as the main differentiator against full desktop LLM Wiki apps.
- Markdown-native review queue.
