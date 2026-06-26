# AI Research Example Workspace

This is a small OKF Harness workspace for inspection and tests by readers. It uses synthetic source material only.

Try it after building the local CLI:

```bash
pnpm build
node packages/cli/dist/main.js check --workspace examples/ai-research-workspace --json
node packages/cli/dist/main.js evidence "What is this source mainly about? What are its key conclusions? Where does the evidence come from?" --workspace examples/ai-research-workspace --json
node packages/cli/dist/main.js search "LLM Wiki" --workspace examples/ai-research-workspace --json
node packages/cli/dist/main.js read topics/llm-wiki --workspace examples/ai-research-workspace --json
```

For a manual first-answer check, ask a workspace-local agent:

```text
$okf-harness Answer the first-answer check for this example workspace: what is this source mainly about, what are its key conclusions, and where does the evidence come from?
```

The answer should stay short, cite supporting concept paths such as `wiki/references/llm-wiki-field-note.md` and `wiki/topics/llm-wiki.md`, name `src_20260616_0001`, and state evidence limits when the evidence command reports any.

The example keeps generated Claude Code and Codex skill files out of the repository so the directory stays readable. In a real workspace, run:

```bash
okfh agent install all --workspace <workspace> --json
```
