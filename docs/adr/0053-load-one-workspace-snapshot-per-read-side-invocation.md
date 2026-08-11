# Load one workspace snapshot per read-side invocation

OKF Harness loads exactly one workspace snapshot per read-side invocation and threads it through every module: resolved root, config, full wiki scan, source manifest, reconciliation ledger, and the deterministic facts derived from them (reference paths per source, dangling edges). The wiki tree is scanned once per command with a consistent view, and no TOCTOU window exists between successive reads of the same workspace state.

planEvidenceBrief, read, search, graph, status, check, and lint compose snapshot-based cores, and checkWorkspace, readWorkspaceStatus, and planEvidenceBrief share one runCheckPipeline assembly (lineage → lint → currency → check) instead of re-assembling the pipeline. Lint, the currency seal, and the consumption seal therefore always derive from the same snapshot and the same facts; the check verdict and the seals can never disagree about a workspace.

The unification also cut the dead public surface in a breaking minor: the exports readCheckCurrency and referenceSourceLinks are removed, while WorkspaceLineage stays for one minor as a `@deprecated` transition alias for WorkspaceSnapshot — the first application of the transition policy (ADR 0054). The removed missing-citations lint rule belongs to the zero-anchor arc (ADR 0048), not to this one.

Consequences: CONTEXT.md records the Workspace snapshot term, parity tests prove the root entries and the snapshot cores agree on the fixture, and a vitest module mock locks one scanConcepts call per entry point so the one-scan-per-command invariant is enforced by test. The cost accepted is that every read-side entry point carries a snapshot-shaped signature instead of a bare workspace path, which is the price of every module observing the same state.
