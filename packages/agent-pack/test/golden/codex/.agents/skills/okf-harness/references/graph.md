# Graph Workflow

Run graph only when the user asks to visualize or generate a graph report:

```bash
okfh graph --workspace <workspace> --json
```

Use `--open` only when the user asks to open the report. Do not hand-roll graph reports.

## Completion Check

Finish with the generated HTML path and backlinks path from the command output. If opening fails but generation succeeds, report the file path and the opener error separately.
