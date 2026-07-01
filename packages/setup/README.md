# @okf-harness/setup

Universal setup planner for local OKF Harness agent integrations.

OKF Harness is an independent open-source project built on Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

Try the local setup plan:

```bash
npx @okf-harness/setup --dry-run
```

Setup checks Node.js 22+, detects supported agent clients on `PATH`, installs or updates the shared global `okfh` runtime when needed, verifies it with `okfh doctor --json`, and keeps `--dry-run` local-only with no network checks or filesystem writes.

For project overview, workflows, and security notes, see the [main repository README](https://github.com/pumblus/okf-harness#readme).
