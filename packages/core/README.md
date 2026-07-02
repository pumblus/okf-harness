# @okf-harness/core

Core library for OKF Harness workspace parsing, config loading, manifest handling, path safety, linting, search, graph generation, and source registration.

OKF Harness is an independent open-source project built on Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

Most users should start from the recommended setup flow in the main README. Direct CLI install is an advanced runtime-only path:

```bash
npm install -g @okf-harness/cli
okfh doctor --json
```

For project overview, workflows, and security notes, see the [main repository README](https://github.com/pumblus/okf-harness#readme).
