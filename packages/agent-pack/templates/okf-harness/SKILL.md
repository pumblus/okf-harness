# OKF Harness

One Door routes OKF Harness workspace requests to exactly one internal workflow at a time.

## Required Behavior

1. Classify the request into setup, check, ingest, reconciliation, answer, graph, or a user-ordered combination of those workflows.
2. Resolve the workspace by finding `okfh.config.yaml`, except during first-time setup where the workspace path is being created.
3. For combined requests, name the workflow sequence, run one workflow at a time in the user's order, and stop before the next workflow when any `okfh --json` command fails.
4. Run harness operations through local-shell `okfh --json` commands and read their JSON before deciding the next step.
5. Load only the reference needed for the current workflow; for combined requests, load the next reference only when that workflow starts.
6. After any wiki edit, run `okfh check --workspace <workspace> --json` and report the check status before broader cleanup advice.
7. If files changed, run `git diff` and name the changed files before the final response.

## First Useful Loop

When the user asks to prove a workspace works with source material, route the first useful loop through existing setup, ingest, check, and answer workflows in the user's order. Normally this means setup or workspace selection, source registration and agent-owned wiki synthesis, workspace check, then the first-answer check from the Answer Workflow.

If the loop cannot continue, report the first-loop blocker as the specific workflow step plus one concrete next action. Do not turn a first-loop blocker into broad cleanup, online search, alternate source selection, or extra product scope.

## Stop Contract

An Agent stop is permitted only when the information needed to decide safely exists solely in the user's head.

If reading the source or wiki can settle the decision, read it and continue instead of asking. After that reading is exhausted, instances that pass the predicate include cases where revision identity remains in doubt, an unresolved contradiction requires the user's intended truth, or a suspected removal requires the user's intent. These are examples, not a closed boundary.

When relevant source and wiki reading is exhausted and the needed information exists in neither workspace evidence nor the user's knowledge, preserve the unresolved unknown faithfully. If the current workflow already permits recording that exact unknown, record it there; otherwise disclose it in the response. Do not replace that unknown with a guess or manufactured certainty, and do not interrupt the user with a question they cannot answer.

Every permitted stop ends with an offer. In every offer, "shall I" always means investigate, never repair. An accepted investigation returns a sharper question, not a fix. Keep drifted bytes unauthoritative. Never re-register drifted bytes to lift a seal.

## Hard Rules

- Do not use this skill for generic Markdown editing, ordinary repository maintenance, knowledge-base work outside an OKF Harness workspace, or repository dependency graphs.
- Do not expose old workflow-specific skill names to users.
- Do not create a workspace skeleton by hand; use `okfh init`.
- Never edit `raw/sources/`; register corrected material as a new source.
- Keep raw source reads inside ingest, reconciliation, or explicit source-audit work. Normal answers use synthesized `wiki/` evidence.
- Never invent source IDs, citations, dates, claims, or command output.
- Do not invent a first-loop, onboarding, or answer CLI command. The CLI does not synthesize wiki content.
- Do not add plugin, hook, Pi, OpenCode, Obsidian, GUI, MCP, or vector-search setup.

## Internal Workflows

- [Setup Workflow](references/setup.md)
- [Check Workflow](references/check.md)
- [Ingest Workflow](references/ingest.md)
- [Reconciliation Workflow](references/reconcile.md)
- [Answer Workflow](references/answer.md)
- [Graph Workflow](references/graph.md)
