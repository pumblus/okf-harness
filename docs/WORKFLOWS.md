# OKF Harness Workflows

English | [中文](zh-CN/WORKFLOWS.md)

OKF Harness is built for people who operate through Claude Code or Codex. The CLI is still visible, but normal work should start with natural language.

The workflow follows Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and uses Google's [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) as the bundle format.

OKF Harness is independent and is not affiliated with or endorsed by Andrej Karpathy or Google.

## Workspace Model

Create one workspace per knowledge domain, research area, or privacy boundary. Good examples:

- `~/Documents/OKF Harness/ai-research`
- `~/Documents/OKF Harness/company-strategy`
- `~/Documents/OKF Harness/personal-health-reading`

On Windows, use the same convention under `%USERPROFILE%\Documents\OKF Harness\...`.

Avoid one hidden global knowledge base. Separate workspaces make agent prompts clearer, keep private material apart, and make lint/search output easier to trust.

## First Setup

Run this once in your local terminal:

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

There is no `okfh query` command in the current CLI. The agent composes answers from search candidate cards plus bounded reads. It should say when evidence came only from synthesized wiki pages and not raw source bodies.

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

Use `--open` only when you want the operating system to open the HTML report in the system default browser. In a Linux environment without a GUI or opener command, open the generated HTML file manually.

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

## Design Restraint

OKF Harness keeps the workflow local, inspectable, and easy to debug from normal terminal commands. Agent answers are built from synthesized `wiki/` content plus bounded reads, while broader product surfaces such as GUI, cloud sync, source connectors, vector retrieval, and Obsidian helpers stay on the roadmap until they can preserve those guarantees.
