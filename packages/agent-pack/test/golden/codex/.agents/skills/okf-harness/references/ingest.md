# Ingest Workflow

Register source material before synthesis:

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

The ingest plan is metadata-level guidance. It returns a recommended reference path, candidate concepts, and an agent checklist; it does not read source bodies, summarize content, extract claims, or synthesize wiki pages.

After wiki edits, run:

```bash
okfh check --workspace <workspace> --json
```

Show changed files, check status, and unresolved questions.
