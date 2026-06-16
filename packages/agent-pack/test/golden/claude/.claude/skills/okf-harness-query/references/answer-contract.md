# Answer Contract

## Query workflow

Use the CLI as the deterministic retrieval layer:

```bash
okfh status --json
okfh read index --json
okfh search "<question>" --json
okfh read <concept-id-or-path> --json
```

There is no `okfh query` command in the current CLI. Compose answers from search candidate cards plus bounded reads.

## Answer shape

Answer with:

- Direct answer.
- Evidence from concept paths and available source IDs.
- A note when evidence came only from wiki synthesis rather than raw source bodies.
- Open questions or contradictions.
- Insufficient-evidence statement when search hits are weak or citations are missing.
- Suggested follow-up only when it naturally follows from the wiki evidence.
