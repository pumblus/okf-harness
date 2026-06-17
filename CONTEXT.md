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

**OKF**:
The external [Open Knowledge Format specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md): a minimal, human- and agent-friendly format for representing knowledge as markdown files with YAML frontmatter. OKF is a format, not this product.
_Avoid_: OKF Harness, Google wiki, knowledge app

**OKF bundle**:
A portable directory of OKF concept documents. It is the knowledge content that agents read and maintain, separate from product-specific workspace files.
_Avoid_: workspace, vault, repository

**Concept document**:
A markdown file in an OKF bundle that represents one readable and linkable knowledge unit, such as a topic, entity, project, decision, question, or reference.
_Avoid_: note, wiki page, knowledge content

**Reference document**:
A concept document that records the origin, summary, key evidence, and citation relationships for one raw source. It is the evidence bridge between a raw source and other concept documents, not the raw source itself.
_Avoid_: source copy, source summary, attachment

**OKF Harness workspace**:
The operating-system-independent local directory managed by OKF Harness around one OKF bundle, its source material, agent guidance, and harness state. People may have multiple workspaces on one machine, usually one per knowledge domain, research area, or privacy boundary; this is product-specific and should not be confused with the OKF bundle itself.
_Avoid_: OKF workspace, Obsidian vault, project repo, global knowledge base

**Workspace collection**:
The set of separate OKF Harness workspaces a person keeps on one machine. It is a loose local organization pattern, not a global database or synchronized account.
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
The immutable registered copy or record of source material inside an OKF Harness workspace. If the source material needs correction, a new raw source should be added rather than editing the old one.
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

**Source status**:
A coarse label for where a raw source stands in the knowledge workflow. It describes evidence handling and must not imply that concept documents have already been updated.
_Avoid_: task status, progress tracker, ingest plan status

**Ingest**:
The workflow of registering source material, planning how it should affect the knowledge base, and having an agent synthesize it into the OKF bundle. Ingest is not a promise that the CLI automatically writes final wiki content.
_Avoid_: import, upload, summarize, auto-ingest

**Ingest plan**:
A deterministic work plan that tells an agent how a raw source may relate to existing concept documents before synthesis begins. It is guidance for agent work, not source reading, a complete search result, or an automatic wiki rewrite.
_Avoid_: search result, summary, source digest, auto-ingest output

**Query**:
The workflow of answering from an OKF bundle by finding and reading relevant concept documents, then following cited reference documents when factual precision matters. Query is not a raw-source discovery pass; registered source material that has not been synthesized into concept documents remains outside normal answers.
_Avoid_: raw source search, RAG, auto-ingest

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
The reserved wiki document that acts as the OKF bundle's human-maintained homepage and orientation map. It can help an agent discover linked concept documents, but a homepage link is not by itself an importance ranking.
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
A discoverable workflow instruction inside an agent adapter that tells an agent when and how to perform one OKF Harness workflow, such as init, ingest, query, or maintain.
_Avoid_: command, script, template

**Layered agent guidance**:
The OKF Harness guidance style where durable rules, workflow instructions, and detailed reference contracts are separated so an agent loads only the level of detail needed for the task. It is a progressive-disclosure structure for agent guidance, not runtime prompt injection.
_Avoid_: prompt injection, hidden prompt, monolithic instructions

**Harness-managed guidance block**:
A clearly marked section inside a generated OKF Harness workspace's agent guidance file that OKF Harness may insert, replace, or remove without owning the rest of the file. It lets agent adapters update their own instructions while preserving user-written project guidance.
_Avoid_: full-file ownership, silent overwrite, prompt injection

**Product roadmap**:
The public-facing direction of OKF Harness across releases, including accepted themes and candidate ideas. It communicates demand level, constraints, and candidate work without promising a specific release version.
_Avoid_: implementation checklist, issue tracker, release promise
