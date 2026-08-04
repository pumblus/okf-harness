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

- None while answering. Retrieval is read-only.
- Accepted write-back is the single exception: after an explicit user yes, write exactly one wiki concept page plus the index link that keeps `MISSING_INDEX_ENTRY` quiet.
- Never write to `raw/`. Write-back never captures the conversation as a source.

## Steps

1. Check status only when needed. Use the Check Workflow first when status is missing, stale, blocked, or the answer depends on high-priority Harness lint findings. Completion: current status is usable, or the blocker is reported.
2. Run `okfh evidence "<question>" --json` as the default retrieval step. Confirm the returned question matches the user request. Completion: evidence, limits, warnings, and continuation cues are known.
3. Treat `okfh search` and `okfh read` as lower-level tools for retrieval debugging, candidate inspection, or explicit continuation cues. Use at most one automatic follow-up `okfh read` along a continuation cue. Completion: zero or one cue-following read has been used.
4. Judge sufficiency and conflicts yourself. Evidence sufficiency and conflict judgment belong to the agent, not the CLI. Completion: answer directly first, then cite supporting concept paths and source IDs, and state evidence limits when evidence is weak, conflicting, truncated, citation-poor, missing, or limited to wiki synthesis.

## Withheld Evidence

When the Evidence Brief contains seals, treat their payloads as internal facts. Render one plain sentence naming which questions can no longer be answered. Keep condition codes, seal payloads, and seal vocabulary out of the user response.

The Harness computes only two provable hops. Inspect concepts beyond that boundary when their prose may carry the same contamination. Widen the internal seal beyond the Harness's two computed hops on your own judgment by withholding those concepts too, and report the widening instead of interrupting the user.

## Provenance Disclosure

When a load-bearing claim rests on pages whose provenance payload is empty — no citations and no source pointers — name in the answer that the knowledge came from conversation rather than an ingested source. Weight is not discounted: the user's own recorded decision carries the same weight as any other evidence. The obligation is retraceability, not caveating; the answer always shows where the provenance trail ends.

The empty provenance payload is the whole signal. No tier flag, no computed marker, and no authorship capture enters the evidence brief or any page's frontmatter.

## Write-Back Offer

Offer to keep an answer only when the Evidence Brief's `guidance` carries the write-back permission. That string appears on the no-match result and on no other result, so its presence is the whole condition. Never offer on a withheld-evidence result, on a truncated brief, or after a continuation read.

When it is present, append the offer as one clause to the disclosure you already owe: the wiki had no evidence, you worked the answer out here, keep it? The offer is ephemeral. No answer means write nothing and persist nothing; the same question reopens the offer next time. A yes writes one ordinary concept page and its index link, and means only that the answer is worth keeping, not that the user certified it.

An answer worked out from the conversation has no registered source behind it, so the written-back page carries no citations. That is a legitimate state and the post-edit check reports nothing for it. Never manufacture a citation, a reference document, or a `raw/` file to give the page an anchor it does not have.

When the written-back answer drew on unanchored pages, the new page's prose names them as derived-from, with plain links. Harness parses, validates, and reports none of it. The lineage is prose, written for the next reader's walkable trail.

Accepted ceiling: an Agent that skips the disclosure or the lineage prose is not caught by anything. Harness can prove the obligation was delivered, never that it was honored.

## First-Answer Check

When answering the first useful loop, answer these three short questions from synthesized wiki evidence:

1. What is the source mainly about?
2. What are its key conclusions?
3. Where does the evidence come from?

## Hard Boundaries

- Do not run or hallucinate an `okfh query` command. No such command exists.
- Normal answer workflows must not read `raw/` source bodies.
- After one cue-following read, answer with explicit evidence limits or ask whether to broaden the task.

## Completion Condition

A normal answer is complete when it is grounded in `okfh evidence` plus at most one cue-following `okfh read`, answers directly first, includes supporting concept paths and source IDs, and either states evidence limits or asks whether to broaden.

A withheld-evidence response is complete when it names the unavailable questions in one plain sentence and reports any semantic widening without exposing internal governance vocabulary.

An accepted write-back is complete when one concept page and its index link are written and the post-edit check and changed-file report from the top-level skill have run.
