# Use Markdown sources for agent skills

OKF Harness keeps generated Claude and Codex adapter files in sync with a renderer, but the skill and reference content should be authored as Markdown template files rather than embedded TypeScript strings. This keeps the user-facing agent guidance readable and reviewable while leaving the renderer responsible only for mechanical concerns such as adapter paths, version injection, managed metadata, and validation-ready output.
