# Ingest Workflow

Register source material before synthesis:

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

The ingest plan is metadata-level guidance. It returns a recommended reference path, candidate concepts, and an agent checklist; it does not read source bodies, summarize content, extract claims, or synthesize wiki pages.

After the plan, read the registered source material and update only the relevant reference, topic, index, or log files. Keep raw sources immutable.

After wiki edits, run:

```bash
okfh check --workspace <workspace> --json
```

## Completion Check

Finish with the registered source ID, changed wiki paths, check status, and unresolved questions. If registration or planning fails, stop before wiki edits and report the failing command's JSON error.
