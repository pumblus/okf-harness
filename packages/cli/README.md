# @okf-harness/cli

Command-line package for OKF Harness local workspaces. It provides the `okfh` command for initializing workspaces, registering sources, checking OKF conformance and Harness lint, preparing evidence briefs, searching and reading pages, generating graph reports, and installing Claude Code or Codex guidance.

OKF Harness is an independent open-source project built on Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

Most users should start from the recommended setup flow in the main README. Workspaces pin this runtime package exactly, and the host skill resolves it on demand through `@okf-harness/setup`.

Try a transient diagnostic without a global install:

```bash
npx --package @okf-harness/cli okfh doctor --json
```

Runtime requirements are macOS, Windows, or Linux; Node.js 22 or newer; the workspace recovery dependency checked by `okfh doctor --json`; and this package. Repository development additionally requires `pnpm` and can be checked with `okfh doctor --dev --json`.

Direct CLI use does not write the unified host entrypoint. Use `@okf-harness/setup` or a native agent integration for ordinary setup, and use `okfh doctor --json` or the compatibility-named `okfh bootstrap` only for diagnostics or advanced fallback repair.

Common commands:

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents codex --json
okfh history --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh check --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh source add ~/Downloads/paper.pdf --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh ingest plan <source-id> --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read topics/llm-wiki --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

On Windows PowerShell, use `$env:USERPROFILE\Documents\OKF Harness` for the workspace parent folder. On Command Prompt, use `%USERPROFILE%\Documents\OKF Harness`.

OKF Harness keeps raw sources under `raw/sources/`, synthesized knowledge under `wiki/`, source records in `.okfh/manifest.jsonl`, and generated reports under `.okfh/reports/`.

For project overview, workflows, security notes, and LLM-readable context, see the [main repository README](https://github.com/pumblus/okf-harness#readme) and [llms.txt](https://github.com/pumblus/okf-harness/blob/main/llms.txt).
