# OKF Harness Workflows

English | [中文](zh-CN/WORKFLOWS.md)

OKF Harness is built for people who operate through Claude Code or Codex. The CLI is still visible, but normal work starts with the agent.

The workflow follows Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and uses Google's [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) as the bundle format.

OKF Harness is independent and is not affiliated with or endorsed by Andrej Karpathy or Google.

## Workspace Model

Create one workspace per knowledge domain, research area, or privacy boundary. Good examples:

- `~/Documents/OKF Harness/ai-research`
- `~/Documents/OKF Harness/company-strategy`
- `~/Documents/OKF Harness/personal-health-reading`

On Windows, use the same convention under `%USERPROFILE%\Documents\OKF Harness\...`.

Avoid one hidden global knowledge base. Separate workspaces make agent prompts clearer, keep private material apart, and make check/search output easier to trust.

## Before You Start

Run this once in your local terminal:

```bash
npm install -g @okf-harness/cli
okfh doctor --json
mkdir -p "$HOME/Documents/OKF Harness"
```

Normal use needs macOS, Windows, or Linux; Node.js 22 or newer; git; and `@okf-harness/cli`. `pnpm` is only for repository development.

You can also ask your agent to check whether `okfh` is installed. The agent must ask for explicit approval before installing a global npm package.

## Start With Your Agent

Use the current agent's OKF Harness prefix.

No workspace yet:

Codex:

```text
$okf-harness Set up a workspace for my AI research notes in my Documents folder, then check that this agent can use it.
```

Claude Code:

```text
/okf-harness Set up a workspace for my AI research notes in my Documents folder, then check that this agent can use it.
```

The agent should call `okfh init` with the adapter for the current agent: `--agents codex` for Codex or `--agents claude` for Claude Code. Use `--agents all` only when you explicitly ask to prepare both supported agents.

After setup, the agent should run `okfh status --workspace <workspace> --json` and tell you to start a fresh Codex thread or Claude Code session so the client can load the new guidance.

## Add A Source

Codex:

```text
$okf-harness Add ~/Downloads/llm-wiki-note.md to this workspace, update the wiki with citations, then check the workspace again.
```

Claude Code:

```text
/okf-harness Add ~/Downloads/llm-wiki-note.md to this workspace, update the wiki with citations, then check the workspace again.
```

The agent should call:

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

Then the agent reads the registered raw source, writes or updates reference and topic pages, updates indexes and the log, and runs check.

Raw sources should not be edited in place. If a source needs correction, register a new source.

## Ask A Question

Codex:

```text
$okf-harness What does my workspace say about LLM Wiki structure?
```

Claude Code:

```text
/okf-harness What does my workspace say about LLM Wiki structure?
```

The agent should call:

```bash
okfh status --workspace <workspace> --json
okfh evidence "<question>" --workspace <workspace> --json
# optional, only when the evidence result includes a needed continuation cue:
okfh read <concept-id-or-path> --workspace <workspace> --offset <offset> --limit <limit> --json
```

There is no `okfh query` command in the current CLI. The agent prepares an evidence brief first, confirms that the returned question matches the request, follows at most one bounded continuation cue when needed, then answers or says that the evidence is missing, weak, truncated, or citation-poor.

Normal answers use synthesized `wiki/` content. The agent should not read `raw/` source bodies unless you explicitly ask for a source-audit or ingest workflow. `search` and `read` remain available for retrieval debugging, candidate inspection, and bounded continuation, but they are no longer the default first step for answering.

## Maintain A Workspace

Codex:

```text
$okf-harness Check this workspace and tell me whether it is ready.
```

Claude Code:

```text
/okf-harness Check this workspace and tell me whether it is ready.
```

The agent should call:

```bash
okfh check --workspace <workspace> --json
```

`check` reports `ready`, `needs_attention`, or `blocked`. It keeps OKF conformance separate from Harness lint, so broken links or missing citations do not become OKF specification failures. After any wiki edit, the agent should run check again and show the changed files.

## Generate A Graph

Codex:

```text
$okf-harness Generate the local graph report for this workspace and tell me where the HTML file is.
```

Claude Code:

```text
/okf-harness Generate the local graph report for this workspace and tell me where the HTML file is.
```

The agent should call:

```bash
okfh graph --workspace <workspace> --json
```

Use `--open` only when you want the operating system to open the HTML report in the system default browser. In a Linux environment without a GUI or opener command, open the generated HTML file manually.

## Repair Agent Support

If a workspace exists but the current agent does not discover OKF Harness guidance, ask through the same prefix:

```text
$okf-harness Repair this workspace's OKF Harness support for Codex.
```

```text
/okf-harness Repair this workspace's OKF Harness support for Claude Code.
```

The agent should call the current adapter by default:

```bash
okfh agent install codex --workspace <workspace> --json
okfh agent install claude --workspace <workspace> --json
```

Use the command that matches the current agent. Use `all` only when you explicitly ask for both adapters. Use `--force` only after reviewing conflicts.

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

OKF Harness keeps the workflow local, inspectable, and easy to debug from normal terminal commands. Agent answers are built from synthesized `wiki/` evidence briefs plus bounded continuation reads when needed, while broader product surfaces such as GUI, cloud sync, source connectors, vector retrieval, and Obsidian helpers stay on the roadmap until they can preserve those guarantees.
