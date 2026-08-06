# Issue tracker: GitHub

Issues and PRDs live as GitHub issues; use the `gh` CLI for all operations.

## Conventions

- **Create**: `gh issue create --title "..." --body "..."` (heredoc for multi-line bodies).
- **Read**: `gh issue view <number> --comments`, fetching labels too and filtering comments with `jq`.
- **List**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with `--label` / `--state` filters as needed.
- **Comment**: `gh issue comment <number> --body "..."`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

## PRs as a triage surface

**Flag: no** — external PRs are not feature requests; `/triage` reads this flag. Set to `yes` to route PRs through the same labels and states:

- **Read**: `gh pr view <number> --comments`; `gh pr diff <number>` for the diff.
- **List external PRs**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, keeping only `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` authors.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label` / `--remove-label`, `gh pr close`.

Issues and PRs share one number space; resolve a bare `#42` with `gh pr view 42`, falling back to `gh issue view 42`.

## Skill verbs

- "Publish to the issue tracker" → create a GitHub issue.
- "Fetch the relevant ticket" → `gh issue view <number> --comments`.

## Wayfinding (`/wayfinder`)

The map is one issue; its tickets are child issues. This repo has sub-issues and native issue dependencies enabled and the `wayfinder:*` labels exist — use the native mechanisms; no task-list or `Blocked by:` fallbacks.

- **Map**: issue labelled `wayfinder:map` holding the Destination / Notes / Decisions-so-far / Fog body; `gh issue create --label wayfinder:map`.
- **Child ticket**: link to the map as a sub-issue via `gh api repos/<owner>/<repo>/issues/<map>/sub_issues`; label `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`); assign to the driving dev once claimed.
- **Blocking**: `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` — the blocker's numeric database id (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`), not the `#number` or `node_id`. Open blockers appear in `issue_dependencies_summary.blocked_by`; a ticket is unblocked when all blockers are closed.
- **Frontier**: the map's open sub-issues minus any with open blockers or assignees, in map order.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: comment the answer, close the issue, then append a context pointer (gist + link) to the map's Decisions-so-far.
