# OKF Harness

OKF Harness is the product context for a macOS-first, agent-first, local-first harness that helps people maintain OKF-compatible local LLM Wikis through coding agents.

## Language

**OKF Harness**:
A local harness for maintaining OKF bundles through Claude Code, Codex, and future coding agents. It is the product around the format, not the OKF specification itself, and it is not a standalone knowledge-base application or an Obsidian plugin.
_Avoid_: OKF app, Obsidian plugin, private agent runtime

**Harness**:
The deterministic support layer around an OKF bundle that gives agents reliable tools for setup, source registration, planning, validation, search, graph generation, and integration. It supports agent work but does not replace the agent or become a knowledge-base application.
_Avoid_: framework, platform, agent runtime

**Harness CLI**:
The `okfh` command-line tool that provides a deterministic tool surface for agent clients and developers. An agent-first knowledge worker should not need to learn CLI language for normal use; they should interact with OKF Harness through natural-language requests to an agent.
_Avoid_: user interface, primary workflow, app

**Terminal-native tool channel**:
The default way an agent client operates OKF Harness by running explicit local shell commands, especially `okfh --json`, through the user's macOS terminal environment. This means local, observable, and debuggable command execution; it does not mean only macOS built-in commands, and it does not require the user to learn CLI language.
_Avoid_: MCP-first integration, native macOS command only, user-facing CLI workflow

**OKF**:
The external Open Knowledge Format specification: a minimal, human- and agent-friendly format for representing knowledge as markdown files with YAML frontmatter. OKF is a format, not this product.
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
The local directory managed by OKF Harness around an OKF bundle, source material, agent guidance, and harness state. This is product-specific and should not be confused with the OKF bundle itself.
_Avoid_: OKF workspace, Obsidian vault, project repo

**Workspace plan**:
The JSON-readable plan for creating an OKF Harness workspace: directories, files, placeholder agent guidance, post-create checks, and warnings. It is primarily for the Harness CLI and agent clients, not a document an agent-first knowledge worker must read directly.
_Avoid_: setup doc, user-facing checklist, installer script

**Source material**:
Original material that a person wants to bring into the knowledge base, such as a file, URL, markdown document, text snippet, or clipboard content. It is evidence for later synthesis, not the synthesized wiki content itself.
_Avoid_: data, document, note

**Raw source**:
The immutable registered copy or record of source material inside an OKF Harness workspace. If the source material needs correction, a new raw source should be added rather than editing the old one.
_Avoid_: source material, wiki page, attachment

**Ingest**:
The workflow of registering source material, planning how it should affect the knowledge base, and having an agent synthesize it into the OKF bundle. Ingest is not a promise that the CLI automatically writes final wiki content.
_Avoid_: import, upload, summarize, auto-ingest

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
