# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo uses a single-context layout.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/adr/` for ADRs that touch the area you are about to work in.

If any of these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```text
/
|-- CONTEXT.md
|-- docs/
|   `-- adr/
`-- packages/
```

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept you need is not in the glossary yet, note it for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding.
