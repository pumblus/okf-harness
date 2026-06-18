# OKF Harness Roadmap

English | [中文](zh-CN/ROADMAP.md)

This is the public product roadmap for OKF Harness. Roadmap items are not release promises. Ideas move into committed work only after they have a clear user story, safety boundary, and verification path.

## Positioning

OKF Harness is an agent-native, file-contract-first, no-app-required knowledge harness.

It is an independent project that builds on Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

It is not affiliated with or endorsed by Andrej Karpathy or Google.

The key difference from full desktop LLM Wiki applications is deliberate: OKF Harness does not try to become the primary knowledge-base app. A person keeps working in Claude Code, Codex, and future agent clients; the harness provides a transparent local workspace, deterministic CLI, bounded reads, lint, and graph reports around ordinary markdown files.

This means OKF Harness should compete on:

- Agent-native workflows instead of a bundled desktop GUI.
- Inspectable markdown and JSON contracts instead of hidden app state.
- Bounded evidence and explicit provenance instead of unbounded context stuffing.
- Local-first, auditable operation through `okfh --json`.
- Optional integrations that never replace the default terminal-native workflow.

## Current Focus

Goal: make OKF Harness useful from Claude Code and Codex through a local, terminal-native workflow.

Included:

- Local workspace initialization for macOS, Windows, and Linux.
- Claude Code and Codex agent adapters.
- Source registration with raw source immutability and manifest integrity.
- Metadata-level ingest planning.
- Deterministic wiki search and read.
- Self-contained local graph report.
- Terminal-native hardening across POSIX shells, PowerShell, and Command Prompt core commands.
- Release documentation.

Design restraint:

- User-facing docs should lead with natural-language prompts to agents, not command tutorials.
- Answers are based on synthesized `wiki/` content, not raw-source-wide discovery.
- There is no `okfh query` or LLM answer command; agents compose answers from `search` and `read`.
- Search returns candidate concept documents, not answer evidence.
- Read output is bounded by default, with explicit continuation options.
- Graph reports show concept links and evidence links; raw source files remain metadata, not graph nodes.
- GUI, cloud sync, accounts, vector search, RAG, automatic web crawling, and Obsidian runtime code stay in demand buckets until they can preserve the local, inspectable workflow.

## High Demand

### OKF Conformance And Harness Lint Layering

Goal: prove that a workspace contains a standards-readable OKF bundle before recommending OKF Harness-specific quality improvements.

Release direction: this should be the next release's main product theme once the user story, safety boundary, and verification path are ready.

Release theme: OKF Harness gives agents one clear entrypoint and checks whether a workspace is OKF-readable before asking them to maintain it.

Next-release scope should stay focused on `check`, a unified `okf-harness` agent entrypoint, current-agent setup, explicit workflow invocation, layered fixtures, regression tests, and documentation or agent-guidance updates. Bounded evidence planning should remain a separate roadmap item rather than sharing the same release theme.

Candidate scope:

- Separate OKF conformance results from Harness lint results in user-facing validation output.
- Keep one normal validation workflow for agents and people, with layered results inside the output.
- Prefer a user-facing `check` workflow over keeping `lint` as a parallel command surface.
- Make check report-only by default; workspace edits should require an explicit user request such as "check and fix".
- When the user explicitly asks to fix check findings, keep automatic fixes narrow: only clear low-risk structural issues such as missing index entries or obvious broken internal links should be changed automatically; evidence, source, citation, or large rewrite issues should be reported with suggested next steps.
- If an old `lint` command is retired, return a clear "Use check instead" message instead of maintaining duplicate behavior.
- Report plain-language check status as `Ready`, `Needs attention`, or `Blocked` before detailed issue codes, with `Blocked` reserved for OKF conformance hard failures.
- Show the OKF version used for conformance, such as `0.1`, in check output.
- For the first `check` release, report `OKF version: 0.1` without adding a user-selectable target flag.
- Keep Harness package version available in JSON or troubleshooting output, but do not emphasize it in the first user-facing check summary.
- Keep human-readable check output concise with status, OKF version, conformance result, lint summary, and grouped priorities; keep full detail in JSON for agents.
- Keep `check --json` on the existing CLI envelope shape and put status, OKF version, OKF conformance, and Harness lint details under `data`.
- In `check --json`, keep top-level `ok: true` for both `Ready` and `Needs attention`; use `ok: false` for `Blocked` or command-level failures.
- Align check exit codes with top-level `ok`: exit 0 for `Ready` and `Needs attention`, non-zero for `Blocked` or command-level failures; do not add a strict mode in this release.
- Keep top-level status simple, but assign Harness lint findings priorities such as high, medium, and low.
- Teach agents that high-priority Harness lint findings require risk disclosure, and should block only answers that directly depend on the affected source or reference.
- Treat ordinary missing citations as medium-priority Harness lint in this release; more semantic upgrades, such as high priority for fact-dense pages without citations, can wait.
- Make clear which findings are OKF specification requirements and which are OKF Harness provenance, citation, or maintainability checks.
- Keep tolerant-consumer behavior visible: broken links and missing citation coverage should not be mislabeled as hard OKF specification failures.
- Keep OKF conformance hard failures minimal: only mark cases as hard failures when the OKF specification clearly disallows them.
- Do not treat broken links, missing citations, missing index entries, unknown frontmatter keys, unknown type values, or source hash drift as OKF conformance hard failures.
- Add scenario-named fixture workspaces that a maintainer can understand without reading implementation code, including `ready-workspace`, `blocked-missing-frontmatter`, `blocked-bad-log-heading`, `needs-attention-source-drift`, `needs-attention-missing-citations`, `needs-attention-broken-link`, and `large-page-bounded-read`.
- Update agent guidance so Claude Code and Codex report conformance status before suggesting broader cleanup, but only when the `check` workflow is implemented.
- Make setup current-agent first: users should not need to choose Claude Code or Codex adapter names in the normal prompt-first flow.
- Let agent guidance determine the current agent client when possible; the CLI should accept explicit agent input rather than guessing the calling client from the shell environment.
- Keep the existing `--agents` CLI shape for now, but have agent guidance pass the current agent explicitly instead of defaulting normal setup to `all`.
- For direct CLI use, do not default initialization to `--agents all`; require an explicit adapter choice such as `codex`, `claude`, or `all` with a deterministic error instead of an interactive prompt.
- Apply the same current-agent-first rule to adapter repair or install flows: `all` remains available only as an explicit choice, not the recommended default.
- Keep `--agents none` for advanced or developer use, but do not expose it in the README entry path or use it from normal agent guidance.
- After current-agent setup, detect other supported local agent clients when possible and ask before preparing workspace guidance for them.
- Keep other-agent detection conservative in this release because only Claude Code and Codex are supported; rely on obvious workspace guidance files or low-risk PATH checks, never broad filesystem scans or private app directories.
- If no other supported agent clients are detected, do not mention cross-agent setup.
- After setup or guidance changes, remind the user to start a fresh agent conversation using the current client's own term, such as a Claude Code session or Codex thread.
- Keep the README setup prompt natural; agent guidance should provide the fresh-session or fresh-thread reminder after setup completes.
- Restructure the README entry path around a short `Before you start` prerequisite section followed by `Start with your agent` workflow-invocation prompts, with CLI reference moved later.
- Let users either run the npm install command themselves or ask an agent to check installation, but require explicit user approval before an agent performs a global install.
- Group README entry prompts by user state: no workspace yet, existing workspace, then a separate common next step for adding a source.
- Use explicit workflow prefixes such as `$okf-harness` for Codex and `/okf-harness` for Claude Code in README entry examples so routing is predictable.
- Show Codex and Claude Code prompts separately instead of using a generic `<prefix>` template.
- Replace multiple user-facing workflow skill names with one `okf-harness` agent entrypoint that routes setup, check, ingest, answer, and graph intents internally.
- Keep the unified skill layered: the main `SKILL.md` should route intent and hold hard rules, while setup, check, ingest, answer, and graph details live in reference files.
- Use a clean break for old workflow-specific skill names: new workspaces should generate only `okf-harness`, and repair or upgrade flows should remove old OKF Harness-managed workflow skills while preserving user-authored files.
- Clean-break removal must only delete files marked as OKF Harness-managed; user-authored or malformed files should be preserved and reported as conflicts.
- After the explicit workflow prefix establishes OKF Harness context, example prompts should use natural shorthand such as `workspace` instead of repeating product terminology in every sentence.
- Keep README prompts natural and concise; do not make users restate behaviors that OKF Harness guidance should already enforce, such as reading wiki pages or citing evidence.
- The answer workflow should be check-aware without running a full workspace check before every answer; it should use recent status when trustworthy and run check only when state is missing, stale, or risky.
- Do not add a complex check-status cache in this release; the answer workflow can inspect `status` first and run `check` only when needed.
- Keep `status` as a quick overview rather than a second full check; it may expose a concise check status for answer routing, but detailed findings belong to `check`.
- Improve natural-language routing quality in skill descriptions, but do not treat prefix-free routing as the stable README path or a release blocker.

Constraints:

- Do not present OKF Harness preferences as OKF specification rules.
- Do not make conformance depend on Obsidian, a GUI, embeddings, cloud services, or source connectors.
- Preserve JSON output that agents can inspect deterministically.

### Bounded Evidence Planning

Goal: make agent answers reliable without overflowing context.

Candidate scope:

- `okfh evidence plan <question> --json` or an equivalent evidence-pack command.
- Deterministic retrieval budget that caps index, candidate pages, citations, and response headroom.
- Explicit `truncated`, `contentLength`, and continuation metadata.
- Agent guidance that teaches Claude Code and Codex how to answer from bounded evidence.
- Tests that prove large wiki pages do not produce unbounded JSON or context payloads.

Constraints:

- No semantic embedding index by default.
- No hidden summarization that claims to understand the wiki.
- No raw-source-wide search unless the user explicitly enters an ingest or source-audit workflow.

### Agent Adapter Expansion

Goal: support more agent clients without weakening the default local-shell model.

Candidates:

- Pi adapter.
- OpenCode adapter.
- Adapter conformance tests shared across clients.
- Improved supported-agent detection as each new adapter is added.
- Investigation for Cursor, VS Code, Aider, Goose, Continue, and GitHub Copilot coding agent.

Constraint: new adapters must preserve the same workflow contracts as Claude Code and Codex. They should not force a private runtime into the default product path.

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
