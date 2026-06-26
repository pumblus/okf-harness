# OKF Harness Profile

English

OKF Harness uses the external Open Knowledge Format as the portable bundle shape: ordinary markdown concept documents with YAML frontmatter. The Harness profile describes the extra local workspace conventions that make those bundles maintainable through agents.

These conventions are product guidance, not changes to the OKF specification.

## Layers

An OKF Harness workspace separates original material, synthesized knowledge, and Harness state:

```text
raw/sources/          registered raw source material
wiki/                 OKF-compatible synthesized concept documents
.okfh/manifest.jsonl  source registry maintained by the harness
okfh.config.yaml      workspace configuration
```

The portable OKF bundle is the `wiki/` directory. The surrounding files help agents register evidence, preserve provenance, validate the workspace, and prepare bounded evidence briefs.

## Workspace Files

### `wiki/`

`wiki/` is the OKF bundle root. Non-reserved markdown files are concept documents and should include YAML frontmatter with at least a non-empty `type` field.

Common concept types in the default profile include `Topic`, `Entity`, `Project`, `Decision`, `Question`, and `Reference`. Other types are allowed by OKF and should be preserved by tolerant consumers.

### `wiki/index.md`

`wiki/index.md` is the human-maintained navigation entry point. It links to important concept documents but is not itself treated as a normal concept document by the Harness profile.

### `wiki/log.md`

`wiki/log.md` records workspace maintenance activity. The Harness profile expects dated headings in `YYYY-MM-DD` form so agents and people can audit changes consistently.

### `wiki/references/`

`wiki/references/` contains reference concept documents. A reference document summarizes one registered source and bridges synthesized concept pages back to the source manifest.

Reference documents should include `type: Reference` and an `okfh.source_id` value that resolves to `.okfh/manifest.jsonl`.

### `raw/sources/`

`raw/sources/` stores registered source material. File sources are copied here and treated as immutable evidence. If a source changes, register the new material as another source instead of editing the existing raw source.

URL sources are different: they record a URL pointer as source material. They do not preserve the webpage body or a durable snapshot.

### `.okfh/manifest.jsonl`

`.okfh/manifest.jsonl` is the source registry. Each row gives a source ID, source kind, original label, workspace-relative source path, hash, timestamp, and optional reference concept.

Concept documents should cite reference pages, and reference pages should bind back to source IDs in this manifest.

### `okfh.config.yaml`

`okfh.config.yaml` describes the workspace layout, bundle root, raw source paths, manifest path, agent support, and safety preferences.

The current default profile keeps `okf.bundle_root` and `paths.wiki_root` aligned so the portable OKF bundle remains easy to locate.

## Portability Boundary

For OKF portability, consumers should be able to read `wiki/` as a markdown-plus-frontmatter bundle. For Harness workflows, agents also need `.okfh/manifest.jsonl`, `raw/sources/`, and `okfh.config.yaml` to preserve provenance and validation behavior.

When sharing a workspace publicly, review whether raw sources, URL pointers, source titles, and manifest metadata are safe to disclose.
