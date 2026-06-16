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

Requirements:

- macOS
- Node.js 22 or newer
- git
- pnpm for repository development

## Workspace Rules

Use one workspace per knowledge domain, research area, or privacy boundary. The recommended parent folder is:

```text
~/Documents/OKF Harness/
```

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

Checks the running CLI, Node.js, git, pnpm, and workspace readiness when a workspace can be resolved.

```bash
okfh doctor --json
okfh doctor --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

`doctor` does not write files.

### init

Creates a workspace and optionally renders Claude Code and Codex adapter files.

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents all --git --json
```

Options:

- `--name <name>` is required.
- `--agents all|claude|codex|none|claude,codex` controls adapter rendering.
- `--git` initializes a git repository without committing.
- `--dry-run` returns the planned writes without creating files.

### agent install

Installs or repairs Claude Code and Codex adapter files in an existing workspace.

```bash
okfh agent install all --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install claude --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install codex --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

Use `--dry-run` to inspect planned writes. Use `--force` only after reviewing conflicts.

### status

Reports workspace initialization, wiki file count, concept count, lint state, and available capabilities.

```bash
okfh status --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

In the current CLI, `search`, `read`, and `graph` are available. There is no `okfh query` command.

### lint

Checks OKF frontmatter, reserved files, log headings, broken links, missing index entries, missing citation sections, manifest rows, source hash drift, missing sources, and unregistered raw source files.

```bash
okfh lint --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

`lint` reports warnings and errors. Errors make `ok` false.

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

Search results are candidate cards, not final evidence. Use `read` before answering.

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

## Exit Behavior

Successful commands return exit code `0`. Validation, workspace, source, or lint failures return a non-zero exit code and include `ok: false` in JSON when `--json` is present.

## Developer Install From Source

For repository development:

```bash
pnpm install
pnpm build
node packages/cli/dist/main.js doctor --json
```
