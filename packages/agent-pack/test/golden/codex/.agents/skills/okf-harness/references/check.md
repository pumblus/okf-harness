# Check Workflow

Run:

```bash
okfh check --workspace <workspace> --json
```

Report the check status first:

- `ready`: OKF conformance passes and Harness lint has no findings.
- `needs_attention`: OKF conformance passes, but Harness lint has maintainability or evidence-integrity findings.
- `blocked`: OKF conformance fails and the workspace is not OKF-readable.

Keep OKF conformance separate from Harness lint. High-priority Harness lint requires risk disclosure, but it blocks only answers that directly depend on affected source or reference records.

Do not fix findings during a plain check request. If the user asked to fix findings too, make only the requested wiki edits and run check again.

## Completion Check

Finish with the check status, OKF version, OKF conformance result, Harness priority counts, and the first concrete next step. If the status is `blocked`, put OKF conformance findings before Harness lint advice.
