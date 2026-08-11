# OKF Harness CLI

English | [中文](zh-CN/CLI.md)

The npm package is `@okf-harness/cli`. It installs the `okfh` command and the longer `okf-harness` alias. Documentation uses `okfh`.

## Run Directly

Most users should use the recommended setup flow in the [README](../README.md). Workspaces run their pinned package version through the launcher. For a transient diagnostic:

```bash
npx --package @okf-harness/cli okfh doctor --json
```

This does not add a global `okfh` binary.

Requirements for normal use:

- macOS, Windows, or Linux
- Node.js 22 or newer
- workspace recovery dependency (checked by setup or `okfh doctor --json`)
- npm access when a pinned runtime version is first fetched

Repository development additionally requires `pnpm`; check that environment with `okfh doctor --dev --json`.

Normal first setup should start from `@okf-harness/setup` or a native agent integration. Universal setup shows each selected integration's read-only verification commands and expected identity, then succeeds only when every final state is `verified`; `failed` and `unavailable` states exit nonzero. `--dry-run` shows the same plan without probing. Direct CLI use does not write the unified host entrypoint.

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

For workspace `status` and `check`, `next` reports the top-priority Workspace next step when one is available. This is person-facing guidance for what to ask the agent to do next, not a new command, machine-readable state code, or menu.

## Commands

### doctor

Checks the running CLI, Node.js, the workspace recovery dependency, runtime platform, native host CLI detection, unified host entrypoint status, and workspace readiness when a workspace can be resolved. `pnpm` is required only for repository development and is checked by `--dev`.

```bash
okfh doctor --json
okfh doctor --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh doctor --dev --json
```

`doctor` does not write files. For a pin-less workspace, the `workspace-runtime-pin` check reports `details.adoptCommand` as an exact executable-and-arguments object that runs `@okf-harness/cli@0.8.1` through `npx`; it does not require a global `okfh`.

In JSON output, `data.checks` remains the flat compatibility list. `data.groups` separates `runtime`, `nativeIntegrations`, `legacyBootstrapFallback`, and `workspace` checks. The historical `legacyBootstrapFallback` key reports the Claude Code and Codex host entrypoints. `nativeIntegrations` keeps `native-host-cli-*` detection separate from `native-integration-*` verification: a missing host CLI skips verification, a verified integration passes, and a failed or unavailable verification warns without failing the overall doctor run. Probe diagnostics identify the client, command, outcome, stable reason, expected identity, and relevant exit code, never raw host output.

### init

Creates a workspace and optionally renders workspace-local adapter files. The current CLI workspace adapters are `codex` and `claude`; native agent integrations are installed through setup or their host package surfaces and do not imply `okfh init --agents` support.

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents codex --json
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents claude --json
```

Options:

- `--name <name>` is required.
- `--agents codex|claude|all|none|claude,codex` is required and controls adapter rendering.
- `--dry-run` returns the planned writes without creating files.

Workspace recovery is established automatically and remains internal. Use the adapter for the workspace-local agent you are currently setting up: `codex` for Codex or `claude` for Claude Code. Use `all` only when you explicitly want both workspace adapters. Use `none` only for advanced or developer setup.

### history

Lists workspace completions newest first. Each completion contains an opaque completion id and its stored judgment. A new workspace has no completions, so it returns an empty list and exits successfully.

```bash
okfh history --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

The JSON payload is `data.completions`, with entries shaped as `{ "id": "...", "judgment": "..." }`.

### checkpoint

Creates a durable completion at the end of a maintenance cycle, storing only the judgment that summarizes why the completion happened. Everything else about the completion is computed from the workspace when needed. Workspaces created before workspace recovery became automatic adopt it on their first checkpoint.

```bash
okfh checkpoint --judgment "Folded the source revision into the wiki." --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

- `--judgment <text>` is required and must be non-blank.

The JSON payload is `data.completion`, shaped as `{ "id": "...", "judgment": "..." }`. The completion then appears in `okfh history`.

### restore

Steps the workspace back to the state at a prior completion, addressed by the opaque completion id from `okfh history`. Restore reaches any completion, not only the latest, and the completions moved through remain listed in `okfh history`, so you can move back and forth. Restore refuses to run while the workspace has changes that are not part of a completion yet.

```bash
okfh restore <completion-id> --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

The JSON payload is `data.completion`, the completion the workspace was restored to.

### agent install

Installs or repairs workspace-local adapter files in an existing workspace. This command currently covers the `codex` and `claude` adapters.

```bash
okfh agent install codex --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install claude --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install all --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

Use the current workspace adapter by default. Use `all` only when you explicitly want both workspace adapters. Use `--dry-run` to inspect planned writes. Use `--force` only after reviewing conflicts.

### bootstrap

Advanced diagnostic and repair tooling for the unified host-level `okf-harness` skill in Claude Code and Codex. The command name remains for compatibility; normal setup starts from `@okf-harness/setup` or a native agent integration.

```bash
okfh bootstrap install --agents codex --json
okfh bootstrap install --agents claude --json
okfh bootstrap install --agents all --json
okfh bootstrap status --agents codex --json
okfh bootstrap repair --agents codex --json
okfh bootstrap uninstall --agents codex --json
```

Use `--agents codex`, `--agents claude`, or `--agents all`. `status` reports `missing`, `installed`, `version-drifted`, `unmanaged-conflict`, or `unwritable-target`. `install` and `repair` create or update the managed `okf-harness` host skill and remove the retired managed `okf-harness-bootstrap` directory. They refuse unmanaged same-name content and report unreadable or unwritable host targets instead of throwing. `uninstall` removes only managed host files. Use `--dry-run --json` with write-capable actions to inspect planned writes or removals.

### status

Reports workspace initialization, wiki file count, concept count, concise check state, available capabilities, and a Workspace next step through the existing `next` field.

```bash
okfh status --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

When human-readable output has a next step, `status` shows the first one as `Next: ...`. In the current CLI, `evidence`, `search`, `read`, and `graph` are available. There is no `okfh query` command.

### check

Checks OKF conformance and OKF Harness maintainability.

```bash
okfh check --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

`check` returns one of three statuses under `data.status`:

- `ready`: OKF conformance passes and Harness lint has no findings.
- `needs_attention`: OKF conformance passes, but Harness lint found maintainability or evidence-integrity issues.
- `blocked`: OKF conformance fails and the workspace is not OKF-readable.

The JSON response reports the OKF version as `data.okfVersion`, currently `0.1`. It keeps OKF conformance in `data.okfConformance`, Harness lint in `data.harnessLint`, and the promoted-source reconciliation seal in `data.currency`. Currency is informational and does not affect status or the exit code. `data.currency.sealed` is `true` only when workspace validation has no error findings and no promoted source has a dangling reconciliation; otherwise it is `false` and `data.currency.diagnostics` lists the deterministic error codes. `data.currency.promotedSources` counts the sources the wiki has promoted; it is reporting only and never enters the seal. The human view shows `Currency: sealed` when promoted sources are present and reconciled, `Currency: no promoted sources to reconcile` when the workspace has promoted none, or `Currency: not sealed (...)` with the implicated source filenames or diagnostic codes; a check envelope that carries no currency verdict renders `Currency: no currency verdict` instead of implying a pass.

`check` uses the same Workspace next-step decision as `status` and reports it through the existing top-level `next` field. When human-readable output has a next step, `check` shows the first one as `Next: ...`.

`ready` and `needs_attention` return top-level `ok: true` and exit `0`. `blocked` returns top-level `ok: false` and exits non-zero.

### adopt-runtime

Records the running Harness runtime's version as the workspace runtime pin, the exact runtime version allowed to write the workspace. It takes no version argument: `okfh init` already stamps new workspaces, and this command records one into a workspace created before pins existed.

```bash
okfh adopt-runtime --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh adopt-runtime --workspace "$HOME/Documents/OKF Harness/ai-research" --dry-run --json
```

The JSON payload reports `data.runtime.version` and `data.state`, one of `recorded`, `already-pinned`, or `would-record`. An already-pinned workspace is left untouched, so the command is safe to rerun, and `--dry-run` reports the pin it would record without writing. A pin is an exact version in the `runtime` block of `okfh.config.yaml`, separate from the top-level `version` key, which stays the workspace format version. A malformed pin or an unreadable config is reported as `CONFIG_INVALID` and nothing is written. `okfh doctor` reports the pin, or reports it missing with this command in the check details, and never fails the run over it.

### source add

Registers a local file or URL pointer as source material.

```bash
okfh source add ~/Downloads/paper.pdf --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh source add https://example.com/article --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

File sources are copied under `raw/sources/YYYY/MM/` and recorded in `.okfh/manifest.jsonl` with a SHA-256 hash. URL sources record the URL as a source pointer. The current CLI does not fetch webpage contents automatically.

Use `--dry-run` to see the planned source record without writing.

### source reconcile

Records that an agent has reconciled one suspected source revision.

```bash
okfh source reconcile src_20260615_0001 src_20260615_0002 --note "Updated affected concept documents for the revision." --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

The first source id is the prior source and the second is its revision. `--note` is required and records the agent's judgment. Successful JSON output returns the recorded entry as `data.acknowledgement`. The manifest must support that exact suspected-revision edge; an acknowledgment does not cover a later revision.

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

JSON data includes:

- `recommendedReferencePath`: the reference document path for the registered source.
- `candidateConcepts`: up to five existing non-reference content pages that may be affected by the source. Candidates include `id`, `path`, `type`, optional `title`, and a mechanical `reason`; they do not include confidence or semantic relevance scores.
- `suggestedNewConcept`: omitted when it does not apply. When present, it is one metadata-derived `Topic` suggestion with `title`, `path`, `type`, and `reason`. The CLI does not create the file.
- `nextStep`: one person-facing handoff prompt for the agent.

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

The JSON data echoes the question and returns `budget`, selected `evidence`, thin `candidates`, `seals`, `limits`, and short `guidance`. Empty evidence is successful when the workspace is readable: an ordinary miss includes `NO_MATCHES`, while a fully sealed result keeps `ok: true` without returning the damaged documents.

On the no-match result only, `guidance` carries one extra string permitting the agent to offer to write the answer back into the wiki as one concept page. Its presence is the whole permission; there is no structured write-back field and no write-back command. A fully sealed result, a truncated brief, and an ordinary match do not carry it, so an offer can never route around a seal or duplicate a page the wiki already holds.

When a registered source is missing, its hash has drifted, or a reference names an unregistered source, evidence withholds that reference document and concepts that cite it directly. Concepts that cite only a sealed concept remain available. Sealed documents are also excluded from `candidates`, so unrelated documents in the same workspace can still be returned. If an invalid config or broken source manifest makes those chains uncomputable, evidence withholds every concept document instead. OKF conformance findings continue to produce a blocked result.

Each `seals` entry carries the condition `code`, affected concept IDs under `sealed`, and a factual `basis`. Anchored seals also carry `sourceId` and `sourcePath` when registered; workspace-wide seals omit both source fields. Seals contain no repair advice. Human output shows the same seal fields. `limits` now reports only mechanical boundaries such as no matches or truncation; these source-integrity conditions are carried by `seals`, not `WORKSPACE_RISK`.

The agent decides whether the remaining evidence is enough to answer. Evidence items include provenance pointers under `provenance`: citations, citation issues, reference pages, source IDs, and safe source-manifest metadata. Normal answer workflows use the synthesized `wiki/` excerpts returned by evidence and do not read `raw/` source bodies.

When an evidence item is truncated, its `range` includes `contentLength`, `returnedChars`, and `truncated`, and `continuationCues` gives a bounded `okfh read` command with `--offset` and `--limit`. Use search and read as lower-level tools for retrieval debugging, candidate inspection, or one bounded continuation.

### read

Reads a bounded OKF wiki document by concept ID, path, or `index`.

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

`wiki/log.md` is not part of a workspace and `log` is not a read target. Workspace history is not wiki knowledge, so it is never citable evidence; use `okfh history` instead. A workspace scaffolded before the removal may still carry the file, but it stays unreadable.

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
