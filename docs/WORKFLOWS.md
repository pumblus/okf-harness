# OKF Harness Workflows

English | [中文](zh-CN/WORKFLOWS.md)

OKF Harness is built for people who operate through Claude Code or Codex. The CLI is still visible, but normal work should start with natural language.

## Workspace Model

Create one workspace per knowledge domain, research area, or privacy boundary. Good examples:

- `~/Documents/OKF Harness/ai-research`
- `~/Documents/OKF Harness/company-strategy`
- `~/Documents/OKF Harness/personal-health-reading`

Avoid one hidden global knowledge base. Separate workspaces make agent prompts clearer, keep private material apart, and make lint/search output easier to trust.

## First Setup

Run this once on a Mac:

```bash
npm install -g @okf-harness/cli
okfh doctor --json
mkdir -p "$HOME/Documents/OKF Harness"
```

Then create a workspace:

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents all --git --json
```

Open the workspace folder in Claude Code or Codex. The generated adapter files teach the agent how to use `okfh --json`.

## Ask An Agent To Set Up A Workspace

You can also ask the agent:

```text
Set up an OKF Harness workspace for my AI research notes under ~/Documents/OKF Harness. Use the default structure, install Claude and Codex support, initialize git, and tell me how to add my first source.
```

The agent should call:

```bash
okfh init <workspace> --name <name> --agents all --git --json
okfh status --workspace <workspace> --json
```

## Add A Source

Ask:

```text
Add ~/Downloads/llm-wiki-note.md to this OKF Harness workspace, create an ingest plan, and update only the relevant wiki pages with citations.
```

The agent should call:

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

Then the agent reads the registered raw source, writes or updates reference and topic pages, updates indexes and the log, and runs lint.

Raw sources should not be edited in place. If a source needs correction, register a new source.

## Ask A Question

Ask:

```text
What does my AI Research wiki say about the LLM Wiki structure? Search and read the wiki before answering, and cite the concept paths you used.
```

The agent should call:

```bash
okfh status --json
okfh read index --json
okfh search "<question>" --json
okfh read <concept-id-or-path> --json
```

There is no `okfh query` command in v0.1. The agent composes answers from search candidate cards plus bounded reads. It should say when evidence came only from synthesized wiki pages and not raw source bodies.

## Maintain A Workspace

Ask:

```text
Check this OKF Harness workspace for broken links, missing citations, source hash drift, and manifest problems. Fix small wiki issues if they are clear.
```

The agent should call:

```bash
okfh lint --json
```

After any wiki edit, it should run lint again and show the changed files.

## Generate A Graph

Ask:

```text
Generate the local graph report for this workspace and tell me where the HTML file is.
```

The agent should call:

```bash
okfh graph --json
```

Use `--open` only when you want macOS to open the HTML report.

## Repair Agent Support

If a workspace exists but Claude Code or Codex does not discover the OKF Harness guidance, ask:

```text
Repair Claude Code and Codex support for this OKF Harness workspace.
```

The agent should call:

```bash
okfh agent install all --workspace <workspace> --json
```

Use `--force` only after reviewing conflicts.

## What Goes Where

```text
raw/inbox/        temporary place to drop unregistered material
raw/sources/      registered raw sources, treated as immutable
wiki/             synthesized OKF markdown concept documents
.okfh/manifest    source register with hashes and source IDs
.okfh/reports/    generated reports such as graph.html
AGENTS.md         Codex workspace guidance
CLAUDE.md         Claude Code workspace guidance
```

## Non-Goals In v0.1

OKF Harness v0.1 does not provide:

- a desktop app or GUI
- cloud sync or accounts
- a background daemon
- automatic web crawling
- vector search or RAG
- raw-source-wide answer search
- Obsidian runtime code
- MCP-first workflow
- Windows or Linux support

These boundaries keep the first release local, inspectable, and easy to debug from normal terminal commands.
