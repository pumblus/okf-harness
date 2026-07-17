# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments`
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** Set to `yes` if this repo should treat external PRs as feature requests; `/triage` reads this flag.

While set to `no`, `/triage` processes GitHub Issues only. Do not pull external PRs into the issue triage queue.

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments`, and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label` / `--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either. Resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is a single issue, and its tickets are child issues.

This repo has GitHub sub-issues and native issue dependencies enabled, and the `wayfinder:*` labels already exist. Use the native mechanisms below; no task-list or `Blocked by:` body fallback is needed here.

- **Map**: an issue labelled `wayfinder:map` holding the Destination / Notes / Decisions-so-far / Fog body. Create with `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue via `gh api repos/<owner>/<repo>/issues/<map>/sub_issues`. Label with `wayfinder:<type>` (`research`, `prototype`, `grilling`, or `task`). Assign to the driving dev once claimed.
- **Blocking**: add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric database id from `gh api repos/<owner>/<repo>/issues/<n> --jq .id` — not the `#number` or `node_id`. Open blockers are reported in `issue_dependencies_summary.blocked_by`. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open sub-issues, drop any with `issue_dependencies_summary.blocked_by > 0` or an assignee, and take the first in map order.
- **Claim**: `gh issue edit <n> --add-assignee @me`.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer to the map's Decisions-so-far.
