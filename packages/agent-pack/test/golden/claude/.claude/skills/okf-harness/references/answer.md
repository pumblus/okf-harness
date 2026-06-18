# Answer Workflow

Use the CLI as the deterministic retrieval layer:

```bash
okfh status --workspace <workspace> --json
okfh read index --workspace <workspace> --json
okfh search "<question>" --workspace <workspace> --json
okfh read <concept-id-or-path> --workspace <workspace> --json
```

There is no `okfh query` command in the current CLI. Do not run or hallucinate an `okfh query` command. Compose answers from search candidate cards plus bounded reads.

Use `okfh check --workspace <workspace> --json` when status is missing, stale, blocked, or the answer depends on high-priority Harness lint findings. Do not run a full check before every answer when current status is already trustworthy.

## Completion Check

Answer directly first. Then list supporting concept paths and available source IDs. If hits are weak, citations are missing, or only wiki synthesis was read, state the evidence limit plainly.
