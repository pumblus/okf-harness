# Graph Workflow

## Intent

Generate the OKF concept graph report for a workspace. This is not a repository dependency graph.

## Preconditions

- The workspace resolves to `okfh.config.yaml`.
- Run graph only when the user asks to visualize or generate a graph report for the OKF workspace.

## Allowed Commands

```bash
okfh graph --workspace <workspace> --json
okfh graph --workspace <workspace> --open --json
```

## Allowed Writes

- `okfh graph` may write `.okfh/backlinks.json` and `.okfh/reports/graph.html`.
- Do not hand-roll graph reports.
- Do not use this workflow for repository dependency graphs.

## Completion Condition

Use `--open` only when the user asks to open the report. Do not hand-roll graph reports.

Finish with the generated HTML path and backlinks path from the command output. If opening fails but generation succeeds, report the file path and the opener error separately.
