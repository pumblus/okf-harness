# @okf-harness/cli

Command-line package for OKF Harness local workspaces. It provides the `okfh` command for initializing workspaces, registering sources, linting wiki content, searching and reading pages, generating graph reports, and installing Claude Code or Codex guidance.

OKF Harness is an independent open-source project built on [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

Install:

```bash
npm install -g @okf-harness/cli
okfh doctor --json
```

Try without a global install:

```bash
npx --package @okf-harness/cli okfh doctor --json
```

For project overview, workflows, and security notes, see the [main repository README](https://github.com/pumblus/okf-harness#readme).
