# @okf-harness/cli

Command-line package for OKF Harness local workspaces. It provides the `okfh` command for initializing workspaces, registering sources, linting wiki content, searching and reading pages, generating graph reports, and installing Claude Code or Codex guidance.

OKF Harness is an independent open-source project built on Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

Most users install this package once, create one local workspace per knowledge domain, then ask Claude Code or Codex to maintain the workspace through `okfh --json`.

Install:

```bash
npm install -g @okf-harness/cli
okfh doctor --json
```

Try without a global install:

```bash
npx --package @okf-harness/cli okfh doctor --json
```

Common commands:

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents all --git --json
okfh source add ~/Downloads/paper.pdf --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh ingest plan <source-id> --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read topics/llm-wiki --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh lint --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

On Windows PowerShell, use `$env:USERPROFILE\Documents\OKF Harness` for the workspace parent folder. On Command Prompt, use `%USERPROFILE%\Documents\OKF Harness`.

OKF Harness keeps raw sources under `raw/sources/`, synthesized knowledge under `wiki/`, source records in `.okfh/manifest.jsonl`, and generated reports under `.okfh/reports/`.

For project overview, workflows, security notes, and LLM-readable context, see the [main repository README](https://github.com/pumblus/okf-harness#readme) and [llms.txt](https://github.com/pumblus/okf-harness/blob/main/llms.txt).
