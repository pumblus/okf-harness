# Guardrails

Rules that bind all agent work. They apply to every change:

- Keep credentials, tokens, and private absolute paths out of tracked files.
- Keep `examples/*/raw/sources/` and fixture raw sources untouched; register a new raw source instead of editing a registered one.
- Keep agent guidance (entrypoint, skills, adapters in `packages/agent-pack` and `skills/`) in sync with the CLI behavior it describes.
- Keep each PR scoped to one problem, with JSON command examples for any CLI change.
- Leave version bumps, publishing, tagging, and releases to release work.
