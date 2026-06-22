# Answer Workflow

## Intent

Answer from synthesized OKF wiki evidence using a bounded Evidence Brief.

## Preconditions

- The workspace resolves to `okfh.config.yaml`.
- The user asked a question that should be answered from the OKF wiki.

## Allowed Commands

```bash
okfh status --workspace <workspace> --json
okfh evidence "<question>" --workspace <workspace> --json
okfh search "<question>" --workspace <workspace> --json
okfh read <concept-id-or-path> --workspace <workspace> --json
```

## Allowed Writes

None. This is a read-only workflow.

## Steps

1. Check status only when needed. Use the Check Workflow first when status is missing, stale, blocked, or the answer depends on high-priority Harness lint findings. Completion: current status is usable, or the blocker is reported.
2. Run `okfh evidence "<question>" --json` as the default retrieval step. Confirm the returned question matches the user request. Completion: evidence, limits, warnings, and continuation cues are known.
3. Treat `okfh search` and `okfh read` as lower-level tools for retrieval debugging, candidate inspection, or explicit continuation cues. Use at most one automatic follow-up `okfh read` along a continuation cue. Completion: zero or one cue-following read has been used.
4. Judge sufficiency and conflicts yourself. Evidence sufficiency and conflict judgment belong to the agent, not the CLI. Completion: answer directly first, then cite supporting concept paths and source IDs, and state evidence limits when evidence is weak, conflicting, truncated, citation-poor, missing, or limited to wiki synthesis.

## Hard Boundaries

- Do not run or hallucinate an `okfh query` command. No such command exists.
- Normal answer workflows must not read `raw/` source bodies.
- After one cue-following read, answer with explicit evidence limits or ask whether to broaden the task.

## Completion Condition

A normal answer is complete when it is grounded in `okfh evidence` plus at most one cue-following `okfh read`, answers directly first, includes supporting concept paths and source IDs, and either states evidence limits or asks whether to broaden.
