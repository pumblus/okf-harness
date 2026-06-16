# Lint Contract

## Supported now

Run:

```bash
okfh lint --json
```

Fix only issues that can be resolved from current wiki context without inventing missing source facts.

## Graph reports

Source hash checks are supported by `okfh lint`. Graph generation is supported by:

```bash
okfh graph --json
```

Run graph only when the user asks to visualize or generate a graph report. Maintain workflows should not generate graph reports automatically.
