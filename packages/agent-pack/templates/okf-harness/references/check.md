# Check Workflow

## Intent

Report whether an OKF Harness workspace is readable, valid, and ready for downstream answers or edits.

## Preconditions

- The workspace resolves to `okfh.config.yaml`.
- The user asked to check, validate, inspect status, or review findings for an OKF Harness workspace.

## Allowed Commands

```bash
okfh check --workspace <workspace> --json
```

## Allowed Writes

None. If the user asks to fix findings, treat it as a combined request: finish the check report, load the relevant mutating workflow, make only the requested wiki edits, and run check again.

## Completion Condition

Report the check status first:

- `ready`: OKF conformance passes and Harness lint has no findings.
- `needs_attention`: OKF conformance passes, but Harness lint has maintainability or evidence-integrity findings.
- `blocked`: OKF conformance fails and the workspace is not OKF-readable.

Keep OKF conformance separate from Harness lint. High-priority Harness lint requires risk disclosure, but it blocks only answers that directly depend on affected source or reference records.

Finish with the check status, OKF version, OKF conformance result, Harness priority counts, and the first concrete next step. If the status is `blocked`, put OKF conformance findings before Harness lint advice.
