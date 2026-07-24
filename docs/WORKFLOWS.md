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

Normal use needs macOS, Windows, or Linux; Node.js 22 or newer; git; the shared `okfh` runtime; and a supported native agent integration. `pnpm` is only for repository development.

## Start With Your Agent

Use the OKF Harness entrypoint name for your current agent. The name is stable; the invocation syntax belongs to the agent. Codex usually uses `$okf-harness`, Claude Code usually uses `/okf-harness`, and other native integrations expose their available OKF Harness entrypoint through their own skill or plugin UI. Some v0.6 native integrations expose only `okf-harness-bootstrap` until a workspace-local adapter exists.

The examples below use `<okf-harness-bootstrap>` and `<okf-harness>` for those entrypoints. Before a workspace exists, use the global bootstrap entrypoint installed by setup or a native integration. After setup or selection, bootstrap either hands off to the workspace-local `okf-harness` entrypoint or tells you the supported next step for that agent.

No workspace yet:

```text
<okf-harness-bootstrap> Set up a workspace for my AI research notes in my Documents folder, then tell me how to refresh this agent context.
```

Bootstrap should discover or select an existing workspace from a shallow local workspace collection when possible. If none is selected, it should perform current-agent setup: infer the display name and target folder, ask before persistent writes when details are missing or ambiguous, and confirm Git when it was not explicit. When the current agent has a workspace-local adapter, bootstrap can call `okfh init` with that adapter. Today the workspace-local adapters are `codex` and `claude`; other native integrations use their bootstrap surface until a workspace adapter exists.

After setup, bootstrap should repair workspace-local guidance when that agent supports it and give an agent context refresh hint, usually opening a fresh agent session from the workspace folder so the client can load the new guidance.

Bootstrap is not the daily workflow. It should not synthesize wiki content, migrate non-empty non-workspace folders, write global root guidance files, or promise unsupported agent clients.

To verify first start end to end:

1. Run setup in a clean environment.
2. Open a supported agent.
3. Confirm `okf-harness-bootstrap` is discoverable in that agent.
4. Use it to create one empty workspace for the current agent.
5. Follow the refresh handoff and confirm the workspace-local `okf-harness` entrypoint is available when that agent supports workspace-local guidance.

## Add A Source

```text
<okf-harness> Add ~/Downloads/llm-wiki-note.md to this workspace, update the wiki with citations, then check the workspace again.
```

The agent should call:

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

Then the agent reads the registered raw source, writes or updates reference and topic pages, updates indexes and the log, and runs check.

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

Using the returned source IDs and recorded paths, the agent reads both immutable registered copies and inspects the reference, concept, index, and log files promoted from or affected by them. It then edits every affected wiki claim to reflect the revision. Reconciliation means the wiki reflects the revision; merely inspecting both copies is not reconciliation. The CLI reports the revision but does not repair the wiki automatically.

After updating the wiki, the agent validates the edits, records its judgment for that exact prior-and-revision pair, and checks the currency seal again:

```bash
okfh check --workspace <workspace> --json
okfh source reconcile <prior-source-id> <revision-source-id> --note "<what changed in the wiki>" --workspace <workspace> --json
okfh check --workspace <workspace> --json
```

The first source ID must be the prior copy and the second its revision. The final `check` verifies that this pair is no longer pending; `data.currency.sealed` is `true` only when no other promoted source has a pending reconciliation and no validation error remains. Never edit registered files under `raw/sources/` or Harness-managed reconciliation state by hand.

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

## Troubleshoot Bootstrap

If the `okf-harness-bootstrap` entrypoint is missing, stale, or blocked by unmanaged same-name content, run:

```bash
okfh doctor --json
```

`doctor` reports runtime, native integration, legacy bootstrap fallback, and workspace checks separately. Use `okfh bootstrap status|repair --agents codex|claude|all --json` as advanced legacy Claude Code and Codex fallback repair tooling, not as the primary first-setup workflow.

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
