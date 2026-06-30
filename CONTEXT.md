# OKF Harness

OKF Harness is the product context for an agent-first, local-first, terminal-native harness that helps people maintain OKF-compatible local LLM Wikis through coding agents.

## Language

**OKF Harness**:
A local harness for maintaining OKF bundles through Claude Code, Codex, and future coding agents. It builds on Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing). It is an independent project around the format, not the OKF specification itself, an official implementation, a standalone knowledge-base application, or an Obsidian plugin.
_Avoid_: OKF app, Obsidian plugin, private agent runtime

**Harness**:
The deterministic support layer around an OKF bundle that gives agents reliable tools for setup, source registration, planning, validation, search, graph generation, and integration. It supports agent work but does not replace the agent or become a knowledge-base application.
_Avoid_: framework, platform, agent runtime

**Harness CLI**:
The `okfh` command-line tool that provides a deterministic tool surface for agent clients and developers. An agent-first knowledge worker should not need to learn CLI language for normal use; they should interact with OKF Harness through natural-language requests to an agent.
_Avoid_: user interface, primary workflow, app

**Terminal-native tool channel**:
The default way an agent client operates OKF Harness by running explicit local shell commands, especially `okfh --json`, through the user's local terminal environment. This means local, observable, and debuggable command execution across supported operating systems; it does not require the user to learn CLI language.
_Avoid_: alternate default tool channel, OS-specific command channel, user-facing CLI workflow

**Prompt-first workflow**:
The normal user experience where a person asks Claude Code, Codex, or another agent client to maintain an OKF Harness workspace with an agent-facing prompt rather than CLI commands. The prompt may use a stable workflow prefix such as `$okf-harness` or `/okf-harness`, but the person should not need to learn `okfh` command names for ordinary setup, ingest, check, query, or maintenance work.
_Avoid_: CLI-first workflow, command tutorial, hidden app UI

**First useful loop**:
The first successful product journey where a person gets from a new or selected workspace to registered local source material, agent-synthesized wiki content, workspace check feedback, and one evidence-backed answer. It is not merely successful installation, an empty workspace, CLI-generated wiki content, or automatic webpage fetching.
_Avoid_: onboarding completion, first install, empty setup, auto-ingest, web crawl

**First-answer check**:
A short default question set used to prove the first useful loop after local source material is synthesized. It asks one sentence each for what the source is about, its key conclusions, and where the evidence comes from; user-facing next-step prompts should spell out those questions instead of relying on the term alone.
_Avoid_: full summary, report, benchmark question, broad review

**First-loop blocker**:
The specific step that prevents the first useful loop from completing, such as source registration, wiki synthesis, workspace check, or evidence-backed answering. It should be reported with one concrete next action rather than triggering automatic online search, source substitution, or broader scope.
_Avoid_: generic error, automatic recovery, silent scope expansion

**Explicit workflow invocation**:
The recommended README entry style where a person uses the current agent client's OKF Harness prefix followed by ordinary language, such as `$okf-harness Add this PDF to my workspace...` in Codex or `/okf-harness Add this PDF to my workspace...` in Claude Code. It makes routing predictable without exposing CLI commands.
_Avoid_: CLI command, hidden automatic routing, adapter jargon

**Unified agent entrypoint**:
The single OKF Harness workflow entrypoint exposed to an agent client, named `okf-harness`. It lets a person use one stable prefix while the guidance routes setup, check, ingest, answer, and graph intents internally.
_Avoid_: multiple user-facing workflow skills, command menu, CLI alias

**Global bootstrap entrypoint**:
The low-frequency discoverable `okf-harness-bootstrap` entrypoint available before a person has selected or entered a specific OKF Harness workspace. It supports setup, workspace discovery or selection, guidance repair, and handoff into workspace-local work without making the person learn CLI commands.
_Avoid_: global workspace, CLI installer, hidden account

**Workspace-local entrypoint**:
The high-frequency `okf-harness` entrypoint loaded from a specific OKF Harness workspace's agent guidance. It handles workspace operations such as check, ingest, answer, and graph after the workspace context is selected.
_Avoid_: global entrypoint, bootstrap command, workspace selector

**Internal workflow**:
An agent-guidance route behind the unified `okf-harness` entrypoint, such as setup, check, ingest, answer, or graph. Internal workflows keep guidance organized, but they are not separate user-facing skill names.
_Avoid_: user-facing skill, CLI command, separate product entrypoint

**Answer workflow**:
The internal agent workflow for answering a person's question from synthesized OKF bundle content by using deterministic search, bounded reads, and citations. It is named for the agent's job and should not imply an `okfh query` command or a black-box answer engine.
_Avoid_: query command, answer engine, raw-source search

**Natural-language routing**:
The agent guidance quality that helps ordinary user requests enter the correct OKF Harness workflow even when the person omits explicit workflow prefixes. It is useful to improve over time, but README should not rely on it as the stable default path because final routing is the agent client's semantic judgment.
_Avoid_: guaranteed routing, CLI command, release blocker

**Workspace-native prompt**:
A natural-language request made inside an agent context where OKF Harness is already implied by the selected skill, current folder, or workspace guidance. It should say "this workspace" or "my workspace" rather than repeatedly naming "OKF Harness workspace."
_Avoid_: command-shaped prompt, product-name repetition, adapter jargon

**Current-agent setup**:
The setup experience where OKF Harness prepares guidance for the agent client the person is already using. The person should not need to choose adapter names during normal setup; global bootstrap may prepare every detected client for bootstrap, but workspace-local setup repairs only the current agent unless the person explicitly asks for more.
_Avoid_: adapter selection, install all adapters by default, user-facing runtime setup, enablement toggle

**Agent context refresh**:
The handoff after setup or guidance changes where a person starts a fresh conversation in the current agent client so the client can load the new workspace guidance. The wording should match the agent client and operating-system conventions, using concrete local paths when known, without turning the handoff into a CLI tutorial.
_Avoid_: app restart, cache clear, manual reload ritual

**OKF**:
The external [Open Knowledge Format specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md): a minimal, human- and agent-friendly format for representing knowledge as markdown files with YAML frontmatter. OKF is a format, not this product.
_Avoid_: OKF Harness, Google wiki, knowledge app

**OKF bundle**:
A portable directory of OKF concept documents. It is the knowledge content that agents read and maintain, separate from product-specific workspace files.
_Avoid_: workspace, vault, repository

**OKF conformance**:
The minimum compatibility check that an OKF bundle follows the external OKF specification closely enough for tolerant OKF consumers to read it. It must describe standard-level requirements separately from OKF Harness quality preferences.
_Avoid_: Harness lint, product quality score, strict style check

**OKF version**:
The external OKF specification version used for a conformance check, such as `0.1`. Workspace check output should show it plainly so people know which standard version the result refers to.
_Avoid_: hidden default, product version, CLI version

**Bundle metadata**:
Non-concept frontmatter that describes an OKF bundle itself, such as `okf_version` on the bundle root `index.md`. It is not concept frontmatter and should not turn a reserved document into a concept document.
_Avoid_: concept metadata, Harness package metadata, wiki page metadata

**Concept document**:
A markdown file in an OKF bundle that represents one readable and linkable knowledge unit, such as a topic, entity, project, decision, question, or reference.
_Avoid_: note, wiki page, knowledge content

**Reference document**:
A concept document that records the origin, summary, key evidence, and citation relationships for one raw source. It is the evidence bridge between a raw source and other concept documents, not the raw source itself.
_Avoid_: source copy, source summary, attachment

**OKF Harness workspace**:
The operating-system-independent local directory managed by OKF Harness around one OKF bundle, its source material, agent guidance, and harness state. People may have multiple workspaces on one machine, usually one per knowledge domain, research area, or privacy boundary; this is product-specific and should not be confused with the OKF bundle itself. In prompt-first contexts where OKF Harness is already established, "workspace" can be used as the natural shorthand.
_Avoid_: OKF workspace, Obsidian vault, project repo, global knowledge base

**Workspace collection**:
The set of separate OKF Harness workspaces a person keeps on one machine. It is a loose local organization pattern that bootstrap may inspect from a parent folder, not a global database, registry, or synchronized account.
_Avoid_: global workspace, account, cloud library

**Workspace plan**:
The JSON-readable plan for creating an OKF Harness workspace: directories, files, placeholder agent guidance, post-create checks, and warnings. It is primarily for the Harness CLI and agent clients, not a document an agent-first knowledge worker must read directly.
_Avoid_: setup doc, user-facing checklist, installer script

**Workspace resolution**:
The way OKF Harness decides which local workspace a command should operate on, either from an explicit workspace path or by finding the nearest `okfh.config.yaml` from the current directory. Command output should expose the resolved workspace so agents and people can verify the target.
_Avoid_: current project guess, global default workspace, hidden app state

**Source material**:
Original material that a person wants to bring into the knowledge base, such as a file, URL, markdown document, text snippet, or clipboard content. It is evidence for later synthesis, not the synthesized wiki content itself.
_Avoid_: data, document, note

**Raw source**:
The immutable registered copy or record of source material inside an OKF Harness workspace. Raw sources are for ingest and source-audit workflows, not normal answer workflows; if the material needs correction, a new raw source should be added rather than editing the old one.
_Avoid_: source material, wiki page, attachment

**URL source**:
A raw source record that preserves a URL as a traceable source pointer. It is not a fetched webpage snapshot; if a webpage version must be preserved, its content should be saved and registered as separate source material.
_Avoid_: webpage archive, fetched page, URL snapshot

**Source registration**:
The act of bringing source material under OKF Harness management by creating or reusing a raw source record. Registration preserves evidence identity; it is not the same as synthesizing knowledge into concept documents.
_Avoid_: import, upload, wiki edit

**Online source review**:
An explicit workflow where an agent searches, fetches, or previews public online material so a person can decide whether it should become source material. It is source acquisition support, not normal wiki query, background crawling, or automatic web ingestion.
_Avoid_: web search query, background crawler, raw-source-wide answer

**Source provenance**:
The non-sensitive traceability information that identifies where source material came from and how a raw source relates to it. Provenance should preserve evidence identity without exposing private local filesystem context.
_Avoid_: absolute file path, audit log, file metadata dump

**Source manifest**:
The append-friendly evidence register for raw sources in an OKF Harness workspace. It must be trustworthy as a whole; invalid entries are evidence integrity problems, not rows to silently ignore.
_Avoid_: cache, index, source list output

**Harness lint**:
The OKF Harness quality check for provenance, citations, manifest integrity, source drift, index coverage, and maintainability signals around an OKF bundle. It can be stricter than OKF conformance, but it must not claim product preferences are OKF specification failures.
_Avoid_: OKF conformance, standard compliance, formatter

**Workspace check**:
The user-facing validation workflow that tells a person and their agent whether an OKF Harness workspace is standards-readable and maintainable. It reports OKF conformance and Harness lint together without making people choose between validation modes.
_Avoid_: lint command, formatter, developer-only validation

**Check status**:
The plain-language outcome of a workspace check: Ready, Needs attention, or Blocked. Blocked is reserved for OKF conformance hard failures; serious Harness lint findings should be surfaced as Needs attention unless they also make the OKF bundle non-conformant.
_Avoid_: exit code, lint severity, raw issue list

**Workspace next step**:
A person-facing concrete next action OKF Harness reports for a workspace's current state, especially to help a person continue the first useful loop. It is based on local, deterministic workspace facts such as check status, registered sources, and synthesized wiki content, and should be phrased so the person can hand it to their agent as the next request.
_Avoid_: state machine, onboarding progress, auto-fix, task list, semantic score

**Harness priority**:
The priority assigned to Harness lint findings inside a workspace check. High priority covers evidence integrity problems such as source drift, missing registered sources, or reference documents that cannot be tied to source records; medium priority covers maintenance gaps such as ordinary missing citations or missing index entries; low priority covers tolerated navigation or cleanup issues such as broken links.
_Avoid_: check status, OKF conformance severity, raw issue code

**Source status**:
A coarse label for where a raw source stands in the knowledge workflow. It describes evidence handling and must not imply that concept documents have already been updated.
_Avoid_: task status, progress tracker, ingest plan status

**Ingest**:
The workflow of registering source material, planning how it should affect the knowledge base, and having an agent synthesize it into the OKF bundle. Ingest is not a promise that the CLI automatically writes final wiki content.
_Avoid_: import, upload, summarize, auto-ingest

**Ingest plan**:
A deterministic work plan that tells an agent how a raw source may relate to existing concept documents before synthesis begins. It is guidance for agent work, not source reading, a complete search result, or an automatic wiki rewrite.
_Avoid_: search result, summary, source digest, auto-ingest output

**Suggested new concept**:
A proposed concept document named by an ingest plan from source metadata when registered source material does not clearly match an existing concept. It is a prompt for agent or user confirmation, not a file created by the CLI or a claim of source understanding.
_Avoid_: auto-created concept, generated wiki page, semantic extraction

**Query**:
A user intent to get an answer from an OKF bundle by finding and reading relevant concept documents, then following cited reference documents when factual precision matters. Query is not an OKF Harness command or internal workflow, and it is not a raw-source discovery pass; registered source material that has not been synthesized into concept documents remains outside normal answers.
_Avoid_: query command, agent workflow, raw-source search, RAG, auto-ingest

**Evidence brief**:
The user-facing name for a bounded evidence package prepared before an agent answers from an OKF bundle. It is a temporary work packet for one question, not a durable collection that tries to gather all possibly relevant knowledge.
_Avoid_: evidence pool, answer, summary, RAG response

**Bounded evidence package**:
The structured evidence contract behind an evidence brief. It gathers relevant concept documents, citation pointers, evidence limits, and continuation cues; it is not the answer itself, a semantic summary, or raw-source-wide discovery.
_Avoid_: answer, query engine, source search, evidence pool, RAG response

**Continuation cue**:
A bounded pointer that tells an agent exactly where it may continue reading after a read result or evidence brief is truncated or incomplete. It is not permission to search raw sources, browse online, or freely expand scope.
_Avoid_: next search, auto research, unbounded follow-up

**Evidence sufficiency**:
The agent-owned judgment that an evidence brief and any bounded follow-up reads are enough to answer a person's question responsibly. OKF Harness can expose mechanical limits, but it should not claim semantic sufficiency.
_Avoid_: CLI confidence, harness answer score, automatic truth judgment

**Evidence item**:
A selected, bounded wiki excerpt included in an evidence brief with provenance and continuation metadata. It is an inspectable input for an agent answer, not a summary, confidence claim, or final answer.
_Avoid_: answer excerpt, confidence item, generated summary

**Candidate concept**:
A concept document surfaced as possibly relevant before its content is selected as evidence or updated during ingest. In ingest planning, candidate concepts are existing content pages that may be affected by a source, not reference documents.
_Avoid_: evidence item, answer excerpt, selected proof, reference document

**Search result**:
A candidate concept list that helps an agent decide which full concept documents to read. It may describe matched fields and hit counts, but it is not final evidence for an answer and should not be treated as a snippet-based search engine page.
_Avoid_: answer excerpt, evidence snippet, source digest

**Search miss**:
A query outcome where deterministic search finds no relevant concept documents in the OKF bundle. It means the synthesized wiki has no matching concept yet; it must not be presented as proof that registered source material contains no answer.
_Avoid_: no source evidence, knowledge base disproved it, raw source absence

**Read result**:
The bounded content view and metadata for one concept document in an OKF bundle. A read result may expose citation and raw-source pointers, but it does not automatically include raw source bodies or unbounded page content.
_Avoid_: raw source read, attachment fetch, source dump

**Reserved wiki document**:
An OKF bundle file with a special workspace role, such as `wiki/index.md` or `wiki/log.md`, rather than a normal concept document. It may be read explicitly for orientation or activity history, but it should not be presented as a concept.
_Avoid_: concept document, arbitrary workspace file, wiki page

**Index document**:
The reserved wiki document that acts as the OKF bundle's human-maintained navigation surface and orientation map. It should be read first to discover likely concept documents, but a homepage link is not by itself evidence or an importance ranking.
_Avoid_: ranking source, concept document, search result

**Graph report**:
A local structure report that helps a person or agent understand links between concept documents in an OKF bundle. It is a maintenance and orientation aid, not an editing interface or standalone knowledge-base browser.
_Avoid_: GUI, graph editor, knowledge-base app

**Evidence link**:
A relationship from a synthesized concept document to the reference document or source ID that supports a factual claim. It is part of the wiki's traceability model; it does not turn raw source files into normal graph nodes.
_Avoid_: raw source node, attachment link, proof of truth

**Semantic analysis**:
The agent-owned interpretation of source material, including meaning, claims, contradictions, and which concept documents should change. OKF Harness may prepare deterministic inputs for semantic analysis, but it should not present its metadata matching as understanding.
_Avoid_: deterministic lint, source registration, metadata match

**Agent-first knowledge worker**:
A person who maintains a local knowledge base primarily by asking an agent to organize, query, and validate it, rather than by learning command-line workflows.
_Avoid_: developer, CLI user, Obsidian user

**Agent client**:
The user-facing client where a person talks to an agent, such as a desktop app or terminal interface. OKF Harness workflows should feel consistent across agent clients, with differences only where a client has different capabilities.
_Avoid_: agent, model, runtime

**Agent guidance**:
The workspace instructions and configuration that tell an agent how to operate OKF Harness safely and consistently. Agent guidance is product workflow metadata, not knowledge content.
_Avoid_: schema, documentation, wiki content

**Agent adapter**:
The rendered set of agent guidance files for a specific agent client, such as Claude Code or Codex. An adapter translates shared OKF Harness workflows into the conventions that client can discover and use.
_Avoid_: agent client, plugin, integration

**Agent skill**:
A discoverable workflow instruction inside an agent adapter. The current user-facing skill is the unified `okf-harness` entrypoint, while setup, check, ingest, answer, and graph remain internal workflows.
_Avoid_: command, script, template

**Agent skill migration backup**:
A preserved copy of an old workflow skill directory, managed, user-authored, or malformed, moved out of the agent client's discoverable skill path during migration to the unified `okf-harness` entrypoint. It protects user content without keeping retired workflow skills active.
_Avoid_: active legacy skill, conflict, managed cleanup

**Layered agent guidance**:
The OKF Harness guidance style where durable rules, workflow instructions, and detailed reference contracts are separated so an agent loads only the level of detail needed for the task. It is a progressive-disclosure structure for agent guidance, not runtime prompt injection.
_Avoid_: prompt injection, hidden prompt, monolithic instructions

**Harness-managed guidance block**:
A clearly marked section inside a generated OKF Harness workspace's agent guidance file that OKF Harness may insert, replace, or remove without owning the rest of the file. It lets agent adapters update their own instructions while preserving user-written project guidance.
_Avoid_: full-file ownership, silent overwrite, prompt injection
