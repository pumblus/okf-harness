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
