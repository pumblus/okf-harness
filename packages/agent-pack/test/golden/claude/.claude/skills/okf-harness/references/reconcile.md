# Reconciliation Workflow

## Intent

Make the wiki reflect a suspected source revision, then record that specific reconciliation.

## Preconditions

- The workspace resolves to `okfh.config.yaml`.
- `okfh check --json` reports a suspected-revision edge or an unsealed currency report with a dangling prior and revision source ID.

## Allowed Commands

```bash
okfh source list --workspace <workspace> --json
okfh check --workspace <workspace> --json
okfh source reconcile <prior-source-id> <revision-source-id> --note "<judgment-note>" --workspace <workspace> --json
```

## Allowed Writes

- Read both registered revisions from their recorded source paths; never edit either copy under `raw/sources/`.
- Edit only wiki reference, concept, index, or log files affected by the revision.
- Keep the reconciliation ledger harness-managed; record judgment only through `okfh source reconcile`.

## Steps

1. For each dangling edge, resolve its prior and revision source paths, read both registered revisions, and inspect every wiki document promoted from or affected by them. Completion: the changed source claims and affected wiki claims are known.
2. Determine what changed and update every affected concept's prose directly. Reconcile means the wiki reflects the revision; reviewing it is not reconciliation. Treat removal as suspected only when the new revision contains a positive textual signal; omission alone does not establish removal. A destructive replacement does not stop: complete the update and report which prior claim will no longer be served. Run `okfh check --workspace <workspace> --json` after the edits and resolve edit-caused findings before continuing. Completion: affected wiki prose reflects the revision and the edited workspace is valid, while the known revision edge remains pending.
3. Record the judgment note with `okfh source reconcile <prior-source-id> <revision-source-id> --note "<judgment-note>" --workspace <workspace> --json`. This verb is the end of the reconciliation workflow. Completion: the returned acknowledgment names the same prior and revision source IDs.

## Completion Condition

The reconciliation is complete only when the final reconcile verb returns the edge-specific acknowledgment.
