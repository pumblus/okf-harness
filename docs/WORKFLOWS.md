# OKF Harness Workflows

English | [中文](zh-CN/WORKFLOWS.md)

OKF Harness is built for people who work through a supported agent. The CLI is still visible, but normal work starts with the agent.

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

Run setup once in your local terminal:

```bash
curl -fsSL https://okf-harness.dev/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://okf-harness.dev/install.ps1 | iex
```

Already have Node.js 22 or newer?

```bash
npx @okf-harness/setup@latest
```

Normal use needs macOS, Windows, or Linux; Node.js 22 or newer; the workspace recovery dependency checked by setup; npm access for the first use of each pinned runtime version; and a supported native agent integration. `pnpm` is only for repository development.

Local-first describes where workspace files live, not an air-gap guarantee.

## Start With Your Agent

Use the OKF Harness entrypoint name for your current agent. Codex usually uses `$okf-harness`, Claude Code usually uses `/okf-harness`, and other native integrations expose `okf-harness` through their skill or plugin UI.

The same prefix works before and inside a workspace:

```text
<okf-harness> Set up a workspace for my AI research notes in my Documents folder.
```

The entrypoint first invokes the launcher. If no workspace resolves, it discovers a shallow local workspace collection or creates a workspace after inferring the display name, target folder, and current agent. If a workspace resolves, it routes directly to check, ingest, reconciliation, answer, graph, or repair work. A missing runtime pin is handled by running the launcher's exact adopt command and retrying; no global `okfh` is required.

Workspace-local adapters remain available for Claude Code and Codex and may add workspace-specific guidance under the same name. Other native integrations keep using the host-level entrypoint for daily work; the skill does not claim that a workspace-local adapter was installed for them.

To verify first start end to end:

1. Run setup in a clean environment.
2. Open a supported agent.
3. Confirm `okf-harness` is discoverable.
4. Use it to create one empty workspace.
5. From inside that workspace, use the same prefix to run a check.

For readability, command blocks below show the delegated runtime's `okfh` form. The host skill never searches `PATH` for that command; it passes the same arguments through `npx @okf-harness/setup@latest launch`.

## Add A Source

```text
<okf-harness> Add ~/Downloads/llm-wiki-note.md to this workspace, update the wiki with citations, then check the workspace again.
```

The agent should call:

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

Then the agent reads the registered raw source, writes or updates reference and topic pages, updates indexes, runs check, and records the completed cycle with `okfh checkpoint --judgment "<why this cycle completed>"`.

Raw sources should not be edited in place. If a source needs correction, register a new source.

### First Useful Loop

A first useful loop starts with local source material. Register a local file, let the agent synthesize wiki pages from that registered source, run `okfh check --workspace <workspace> --json`, then ask the first-answer check: what the source is mainly about, what its key conclusions are, and where the evidence comes from.

URL sources stay as source pointers. OKF Harness records the URL, but does not fetch webpage contents automatically.

`okfh status` and `okfh check` can return a Workspace next step in JSON `next`, and human-readable output can show it as `Next: ...`. Treat that line as the next prompt for your agent in this loop: add one local source file, save webpage content as a local file instead of relying on a URL pointer, update the wiki with citations, handle check findings, or run the first-answer check. The CLI reports the step; it does not fetch pages, repair findings, score content quality, or synthesize wiki pages for you.

## Reconcile A Source Revision

```text
<okf-harness> Reconcile the revised research note with this workspace, update every affected wiki claim, and verify the workspace currency seal.
```

OKF Harness detects a suspected source revision when a later local source has the same original filename as an earlier registered file but different contents. If the revised local file is not registered yet, the agent first calls:

```bash
okfh source add <revised-path> --workspace <workspace> --json
```

If `check` already detected a registered suspected revision, skip that registration. In either case, the agent identifies the exact prior and revision records with:

```bash
okfh source list --workspace <workspace> --json
okfh check --workspace <workspace> --json
```

Using the returned source IDs and recorded paths, the agent reads both immutable registered copies and inspects the reference, concept, and index files promoted from or affected by them. It then edits every affected wiki claim to reflect the revision. Reconciliation means the wiki reflects the revision; merely inspecting both copies is not reconciliation. The CLI reports the revision but does not repair the wiki automatically.

After updating the wiki, the agent validates the edits, records its judgment for that exact prior-and-revision pair, and checks the currency seal again:

```bash
okfh check --workspace <workspace> --json
okfh source reconcile <prior-source-id> <revision-source-id> --note "<what changed in the wiki>" --workspace <workspace> --json
okfh check --workspace <workspace> --json
```

The first source ID must be the prior copy and the second its revision. The final `check` verifies that this pair is no longer pending; `data.currency.sealed` is `true` only when no other promoted source has a pending reconciliation and no validation error remains. Never edit registered files under `raw/sources/` or Harness-managed reconciliation state by hand. Once the wiki reflects the revision, the agent completes the cycle with `okfh checkpoint`.

## Undo A Bad Change

```text
<okf-harness> What did we change recently, and can you undo the pricing rewrite?
```

The agent should call:

```bash
okfh history --workspace <workspace> --json
okfh restore <completion-id> --workspace <workspace> --json
```

`history` lists workspace completions newest first, each with an opaque completion id and the judgment recorded when that cycle completed. The agent reads those judgments to decide which completion you mean, then restores it; you describe the change in plain language and never pick an identifier yourself.

Restore reaches any completion, not only the most recent, so a change noticed several cycles late is still recoverable. The completions moved through stay listed afterwards, so the workspace can move back and forth. Restore refuses to run while the workspace has changes that are not part of a completion yet: complete or discard them first.

There is no `wiki/log.md`. Workspace history is computed from the workspace itself, so it never competes with the wiki for your attention and is never citable as evidence.

## Ask A Question

```text
<okf-harness> What does my workspace say about LLM Wiki structure?
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

```text
<okf-harness> Check this workspace and tell me whether it is ready.
```

The agent should call:

```bash
okfh check --workspace <workspace> --json
```

`check` reports `ready`, `needs_attention`, or `blocked`. It keeps OKF conformance separate from Harness lint, so broken links or missing citations do not become OKF specification failures. After any wiki edit, the agent should run check again and show the changed files.

## Generate A Graph

```text
<okf-harness> Generate the local graph report for this workspace and tell me where the HTML file is.
```

The agent should call:

```bash
okfh graph --workspace <workspace> --json
```

Use `--open` only when you want the operating system to open the HTML report in the system default browser. In a Linux environment without a GUI or opener command, open the generated HTML file manually.

## Repair Agent Support

If a workspace exists but the current agent does not discover OKF Harness guidance, ask through the same entrypoint:

```text
<okf-harness> Repair this workspace's OKF Harness support.
```

The agent should repair the current workspace-local adapter when one exists:

```bash
okfh agent install codex --workspace <workspace> --json
okfh agent install claude --workspace <workspace> --json
```

Use the command that matches the current workspace adapter. Use `all` only when you explicitly ask for both workspace adapters. Use `--force` only after reviewing conflicts. For native integrations without a workspace adapter, use setup or the host integration's repair flow instead.

## Troubleshoot The Entrypoint

If the `okf-harness` entrypoint is missing, stale, or blocked by unmanaged same-name content, run:

```bash
npx --yes --package @okf-harness/cli@latest okfh doctor --json
```

`doctor` reports runtime, native integration, host entrypoint, and workspace checks separately. Use `okfh bootstrap status|repair --agents codex|claude|all --json` as advanced Claude Code and Codex fallback repair tooling, not as the primary setup workflow.

## What Goes Where

```text
raw/inbox/        temporary place to drop unregistered material
raw/sources/      registered raw sources, treated as immutable
wiki/             synthesized OKF markdown concept documents
.okfh/manifest    source register with hashes and source IDs
.okfh/reports/    generated reports such as graph.html
AGENTS.md         workspace guidance when the Codex adapter is installed
CLAUDE.md         workspace guidance when the Claude Code adapter is installed
```

## Design Restraint

OKF Harness keeps the workflow local, inspectable, and easy to debug from normal terminal commands. Agent answers are built from synthesized `wiki/` evidence briefs plus bounded continuation reads when needed, while broader product surfaces such as GUI, cloud sync, source connectors, vector retrieval, and Obsidian helpers stay on the roadmap until they can preserve those guarantees.
