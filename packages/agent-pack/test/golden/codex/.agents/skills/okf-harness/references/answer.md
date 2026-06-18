# Answer Workflow

Use the CLI as the deterministic retrieval layer:

```bash
okfh status --json
okfh read index --json
okfh search "<question>" --json
okfh read <concept-id-or-path> --json
```

There is no `okfh query` command in the current CLI. Do not run or hallucinate an `okfh query` command. Compose answers from search candidate cards plus bounded reads.

Use `okfh check --json` when status is missing, stale, blocked, or the answer depends on high-priority Harness lint findings. Do not run a full check before every answer when current status is already trustworthy.

Answer directly first, then list supporting concept paths and available source IDs. If hits are weak, citations are missing, or only wiki synthesis was read, state the evidence limit plainly.
