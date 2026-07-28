# @okf-harness/setup

Universal setup planner for local OKF Harness agent integrations.

OKF Harness is an independent open-source project built on Andrej Karpathy's [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern and Google's [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

Try the local setup plan:

```bash
npx @okf-harness/setup --dry-run
```

Run a workspace's exact pinned runtime without a global install:

```bash
npx @okf-harness/setup@latest launch --workspace "/path/to/workspace" -- status --json
```

Arguments after `--` pass to `okfh` unchanged. A direct runtime result means `DELEGATED`; its exit code and streams pass through unchanged. Launcher-only failures are JSON on stderr with a closed outcome code and, when a runtime cannot be fetched or executed, the attempted invocation. `RUNTIME_PIN_MISSING` returns `data.adoptCommand` as an exact executable-and-arguments object.

Setup checks Node.js 22+, detects supported agent clients on `PATH`, installs selected native integrations containing the unified `okf-harness` host entrypoint, and keeps `--dry-run` local-only with no network checks or filesystem writes. It never installs a global `okfh`; workspace operations resolve their pinned runtime through `launch`.

For project overview, workflows, and security notes, see the [main repository README](https://github.com/pumblus/okf-harness#readme).
