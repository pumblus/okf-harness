# Data Analytics Example Workspace

This small workspace shows how OKF Harness can represent data semantics, not only personal research notes.

It includes a synthetic ecommerce data dictionary as a registered raw source, a reference page, table concepts, a metric definition, and a join-path concept.

Try it after building the local CLI:

```bash
pnpm build
node packages/cli/dist/main.js check --workspace examples/data-analytics-workspace --json
node packages/cli/dist/main.js evidence "How do we calculate monthly active buyers?" --workspace examples/data-analytics-workspace --json
```
