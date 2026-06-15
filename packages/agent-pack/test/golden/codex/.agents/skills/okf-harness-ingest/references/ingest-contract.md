# Ingest Contract

## Supported now

Run:

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

The ingest plan is metadata-level guidance. It returns a recommended reference path, candidate concepts, and an Agent checklist; it does not read source bodies, summarize content, extract claims, or synthesize wiki pages.

## Wiki update contract

- Create or update one `wiki/references/<slug>.md` page per source.
- Update only affected `wiki/topics/`, `wiki/entities/`, `wiki/projects/`, `wiki/decisions/`, or `wiki/questions/` pages.
- Preserve uncertainty and contradictions.
- Add or update `# Citations` sections.
- Update `wiki/index.md` and relevant subdirectory indexes.
- Append `wiki/log.md`.
