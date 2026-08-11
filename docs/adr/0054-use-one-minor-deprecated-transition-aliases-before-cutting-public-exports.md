# Use one-minor deprecated transition aliases before cutting public exports

When OKF Harness must change a public package export, a transition alias is owed only to consumers that could still reach the export: a public export that needs a transition keeps a `@deprecated` alias for one minor release, then is hard-cut; an export that no live consumer can reach is cut immediately, without an alias. The workspace runtime pin (CONTEXT.md) lets every workspace choose its Harness runtime version, so one minor is enough notice — the pinned runtime keeps working for the workspace regardless of what the next release cuts.

The policy was applied for the first time in the snapshot arc (ADR 0053): readCheckCurrency and referenceSourceLinks had no live consumers and were removed outright, while WorkspaceLineage kept a `@deprecated` alias for WorkspaceSnapshot for one minor. Its inconsistency — two hard cuts beside one aliased transition — is what made the policy explicit instead of leaving each cut to the judgment of whoever edits the exports next.

The cost accepted is that a deprecated alias is public surface kept alive past its usefulness: it must stay type-correct, documented, and eventually removed. The alternative — cutting everything immediately, or aliasing everything for a fixed number of releases — either breaks pinned consumers without notice or lets dead surface accumulate.
