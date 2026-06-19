# Ingest Workflow

## Intent

Register source material, plan the ingest, read the source, make bounded wiki edits, and validate the workspace.

## Preconditions

- The workspace resolves to `okfh.config.yaml`.
- The user supplied a source path or URL, or the source is already registered and named by ID or path.
- The source is accessible from the local shell before synthesis begins.

## Allowed Commands

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
okfh check --workspace <workspace> --json
```

## Allowed Writes

- `okfh source add` may register the source and write harness-managed source records.
- Manual edits are limited to relevant wiki reference, topic, index, or log files.
- Never edit `raw/sources/`; register corrected material as a new source.
- If the planned or actual wiki edit would exceed `max_files_changed_per_ingest` from `okfh.config.yaml`, stop and ask the user before editing more files. In v0.3.1 this limit is agent-enforced guidance; the CLI does not enforce it yet.

## Completion Condition

The ingest plan is metadata-level guidance. It returns a recommended reference path, candidate concepts, and an agent checklist; it does not read source bodies, summarize content, extract claims, or synthesize wiki pages.

If registration or planning fails, stop before wiki edits and report the failing command's JSON error. Otherwise, read the registered source material, update only bounded wiki files, run check, and finish with the registered source ID, changed wiki paths, check status, and unresolved questions.
