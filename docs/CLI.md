# OKF Harness CLI

English | [中文](zh-CN/CLI.md)

The npm package is `@okf-harness/cli`. It installs the `okfh` command and the longer `okf-harness` alias. Documentation uses `okfh`.

## Install

```bash
npm install -g @okf-harness/cli
okfh doctor --json
```

Trial run without a global install:

```bash
npx --package @okf-harness/cli okfh doctor --json
```

Requirements for normal use:

- macOS, Windows, or Linux
- Node.js 22 or newer
- git
- `@okf-harness/cli`

Repository development additionally requires `pnpm`; check that environment with `okfh doctor --dev --json`.

## Workspace Rules

Use one workspace per knowledge domain, research area, or privacy boundary. The recommended parent folder is only a documentation convention. OKF Harness does not resolve a hidden global workspace from it.

| Environment | Recommended parent folder |
|---|---|
| macOS or Linux shell | `$HOME/Documents/OKF Harness` |
| Windows PowerShell | `$env:USERPROFILE\Documents\OKF Harness` |
| Windows Command Prompt | `%USERPROFILE%\Documents\OKF Harness` |

Most commands resolve a workspace from `--workspace <path>` or by finding the nearest `okfh.config.yaml` from the current directory. Source-changing commands require an explicit workspace path so files are not registered into the wrong folder.

## JSON Shape

Commands that support `--json` return the same envelope:

```json
{
  "ok": true,
  "command": "status",
  "workspace": "/absolute/workspace/path",
  "data": {},
  "warnings": [],
  "next": []
}
```

Failures use the same shape with `ok: false` and an `error` object. Agent guidance should rely on this JSON contract rather than parsing human terminal output.

## Commands

### doctor

Checks the running CLI, Node.js, git, runtime platform, and workspace readiness when a workspace can be resolved. `pnpm` is required only for repository development and is checked by `--dev`.

```bash
okfh doctor --json
okfh doctor --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh doctor --dev --json
```

`doctor` does not write files.

### init

Creates a workspace and optionally renders Claude Code and Codex adapter files.

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents codex --git --json
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents claude --git --json
```

Options:

- `--name <name>` is required.
- `--agents codex|claude|all|none|claude,codex` is required and controls adapter rendering.
- `--git` initializes a git repository without committing.
- `--dry-run` returns the planned writes without creating files.

Use the adapter for the agent you are currently setting up: `codex` for Codex or `claude` for Claude Code. Use `all` only when you explicitly want both supported adapters. Use `none` only for advanced or developer setup.

### agent install

Installs or repairs Claude Code and Codex adapter files in an existing workspace.

```bash
okfh agent install codex --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install claude --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install all --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

Use the current agent adapter by default. Use `all` only when you explicitly want both supported adapters. Use `--dry-run` to inspect planned writes. Use `--force` only after reviewing conflicts.

### bootstrap

Installs, repairs, inspects, or uninstalls managed global bootstrap skills for supported agents.

```bash
okfh bootstrap install --agents codex --json
okfh bootstrap install --agents claude --json
okfh bootstrap install --agents all --json
okfh bootstrap status --agents codex --json
okfh bootstrap repair --agents codex --json
okfh bootstrap uninstall --agents codex --json
```

Use `--agents codex`, `--agents claude`, or `--agents all`. `status` reports `missing`, `installed`, `version-drifted`, or `unmanaged-conflict`. `install` and `repair` create missing managed files or replace managed drift. They refuse unmanaged same-name content. `uninstall` removes only managed bootstrap files and also refuses unmanaged same-name content. Use `--dry-run --json` with `install`, `repair`, or `uninstall` to inspect planned writes or removals without changing files.

### status

Reports workspace initialization, wiki file count, concept count, concise check state, and available capabilities.

```bash
okfh status --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

In the current CLI, `evidence`, `search`, `read`, and `graph` are available. There is no `okfh query` command.

### check

Checks OKF conformance and OKF Harness maintainability.

```bash
okfh check --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

`check` returns one of three statuses under `data.status`:

- `ready`: OKF conformance passes and Harness lint has no findings.
- `needs_attention`: OKF conformance passes, but Harness lint found maintainability or evidence-integrity issues.
- `blocked`: OKF conformance fails and the workspace is not OKF-readable.

The JSON response reports the OKF version as `data.okfVersion`, currently `0.1`. It keeps OKF conformance in `data.okfConformance` and Harness lint in `data.harnessLint`.

`ready` and `needs_attention` return top-level `ok: true` and exit `0`. `blocked` returns top-level `ok: false` and exits non-zero.

### lint

`lint` is retired as the normal validation command. It points callers to `check`.

```bash
okfh lint --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

Use `okfh check --workspace <path> --json` instead.

### source add

Registers a local file or URL pointer as source material.

```bash
okfh source add ~/Downloads/paper.pdf --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh source add https://example.com/article --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

File sources are copied under `raw/sources/YYYY/MM/` and recorded in `.okfh/manifest.jsonl` with a SHA-256 hash. URL sources record the URL as a source pointer. The current CLI does not fetch webpage contents automatically.

Use `--dry-run` to see the planned source record without writing.

### source list

Lists registered source records.

```bash
okfh source list --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

### ingest plan

Creates a deterministic checklist for how an agent should synthesize a registered source into the wiki.

```bash
okfh ingest plan src_20260615_0001 --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

The plan uses metadata only. The agent must read the source before writing semantic wiki content.

### search

Searches synthesized wiki concept documents. It does not search raw sources.

```bash
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh search "type:Topic LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --limit 20 --json
```

Supported filters:

- `type:<value>`
- `tag:<value>`
- `path:<prefix>`

Search results are candidate cards, not final evidence. Use `evidence` before answering.

### evidence

Prepares a bounded evidence brief from synthesized wiki concept documents. It does not answer the question and does not search raw sources.

```bash
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --budget compact --json
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --max-chars 120000 --json
```

Options:

- `--budget compact|standard|large` selects a deterministic evidence-text character budget. Use compact around 256k, standard around 400k, and large around 1M when either the model or agent client has that context window. These are selection guides, not token estimates or guarantees that the full JSON fits a context window.
- `--max-chars <number>` overrides the preset with an explicit evidence-text character limit.

The JSON data echoes the question and returns `budget`, selected `evidence`, thin `candidates`, `limits`, and short `guidance`. Empty evidence is a successful result when the workspace is readable: `ok` stays `true`, `evidence` is empty, and `limits` includes a mechanical no-match code.

`limits` reports mechanical boundaries such as no matches, truncation, or workspace citation and provenance risk. The agent decides whether the evidence is enough to answer. Evidence items include provenance pointers under `provenance`: citations, citation issues, reference pages, source IDs, and safe source-manifest metadata. Normal answer workflows use the synthesized `wiki/` excerpts returned by evidence and do not read `raw/` source bodies.

When an evidence item is truncated, its `range` includes `contentLength`, `returnedChars`, and `truncated`, and `continuationCues` gives a bounded `okfh read` command with `--offset` and `--limit`. Use search and read as lower-level tools for retrieval debugging, candidate inspection, or one bounded continuation.

### read

Reads a bounded OKF wiki document by concept ID, path, `index`, or `log`.

```bash
okfh read index --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read topics/llm-wiki --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read wiki/topics/llm-wiki.md --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

Options:

- `--section <heading>` reads a section by heading.
- `--section-id <id>` reads a stable section ID.
- `--offset <number> --limit <number>` reads a range.
- `--full` explicitly asks for a full bounded read.

When content is truncated, the JSON response tells the agent how to continue.

### graph

Builds backlink data and a self-contained local HTML report.

```bash
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --open --json
```

The report is written under `.okfh/reports/graph.html`. The graph does not upload data.

`--open` asks the operating system to open the report in the system default browser or HTML handler. On Linux environments without a GUI or opener command, OKF Harness still writes the report and returns a clear error telling you to open the HTML file manually.

## Exit Behavior

Successful commands return exit code `0`. Validation, workspace, or source command failures return a non-zero exit code and include `ok: false` in JSON when `--json` is present. For `check`, `ready` and `needs_attention` exit `0`; `blocked` exits non-zero.

## Developer Install From Source

For repository development:

```bash
pnpm install
pnpm build
node packages/cli/dist/main.js doctor --json
```
