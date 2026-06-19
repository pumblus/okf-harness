# Answer Workflow

## Intent

Answer from an OKF Harness workspace using bounded CLI retrieval, not invented commands or unsourced memory.

## Preconditions

- The workspace resolves to `okfh.config.yaml`.
- The user asked a question that should be answered from the OKF wiki or registered sources.

## Allowed Commands

```bash
okfh status --workspace <workspace> --json
okfh read index --workspace <workspace> --json
okfh search "<question>" --workspace <workspace> --json
okfh read <concept-id-or-path> --workspace <workspace> --json
```

## Allowed Writes

None. This is a read-only workflow.

## Completion Condition

There is no `okfh query` command in the current CLI. Do not run or hallucinate an `okfh query` command. Compose answers from search candidate cards plus bounded reads.

Use the Check Workflow first when status is missing, stale, blocked, or the answer depends on high-priority Harness lint findings. Do not run a full check before every answer when current status is already trustworthy.

Answer directly first. Then list supporting concept paths and available source IDs. If hits are weak, citations are missing, or only wiki synthesis was read, state the evidence limit plainly.
