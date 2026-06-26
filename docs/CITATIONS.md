# Citations And Provenance

English

OKF Harness answers are grounded in synthesized `wiki/` concept documents and the provenance they carry. This document describes the recommended citation chain for the default Harness profile.

## Recommended Chain

```text
synthesized concept page
  -> cites a reference concept
  -> reference concept declares okfh.source_id
  -> source_id resolves to .okfh/manifest.jsonl
  -> manifest row points to raw/sources/... or a URL pointer
```

This chain lets `okfh evidence` return bounded wiki excerpts together with the source IDs and source pointers that support them.

## Concept Pages

Synthesized concept pages should cite reference pages when making factual claims from sources.

Recommended form:

```markdown
# Citations

- [Ecommerce Data Dictionary](../references/ecommerce-data-dictionary.md)
```

Avoid relying only on bare URLs, raw source paths, or unregistered source IDs in synthesized concept pages. Those forms are harder for agents and tools to validate.

## Reference Pages

A reference page represents one registered source. It should summarize the source and bind to the manifest row with `okfh.source_id`.

Recommended frontmatter:

```yaml
---
type: Reference
title: Ecommerce Data Dictionary
resource: raw/sources/2026/06/ecommerce-data-dictionary.md
okfh:
  source_id: src_20260626_0001
---
```

Recommended citation section:

```markdown
# Citations

- src_20260626_0001
```

The `okfh.source_id` value is the primary binding between a reference page and `.okfh/manifest.jsonl`.

## Source Manifest Rows

The manifest row is the registry record for a source. File sources point to immutable raw source copies under `raw/sources/`. URL sources point to a registered URL pointer, not a fetched webpage snapshot.

Reference pages should not invent source IDs. Use source IDs returned by `okfh source add`.

## URL Sources

`okfh source add <url>` records a URL source pointer. It does not fetch, archive, or snapshot the webpage body.

When durable evidence is required, save the webpage, PDF, or markdown content first, then register that saved file as a file source.

## Evidence Limits

The Harness can expose missing citations, broken reference links, missing source IDs, source hash drift, and evidence truncation. It does not decide whether conflicting evidence is semantically resolved. The answering agent remains responsible for stating uncertainty when evidence is missing, weak, conflicting, truncated, or citation-poor.
