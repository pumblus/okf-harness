# AI Research Example Workspace

This is a small OKF Harness workspace for inspection and tests by readers. It uses synthetic source material only.

Try it after building the local CLI:

```bash
pnpm build
node packages/cli/dist/main.js lint --workspace examples/ai-research-workspace --json
node packages/cli/dist/main.js search "LLM Wiki" --workspace examples/ai-research-workspace --json
node packages/cli/dist/main.js read topics/llm-wiki --workspace examples/ai-research-workspace --json
```

The example keeps generated Claude Code and Codex skill files out of the repository so the directory stays readable. In a real workspace, run:

```bash
okfh agent install all --workspace <workspace> --json
```
