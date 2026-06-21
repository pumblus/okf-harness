# Route answer workflows through evidence briefs

Claude and Codex answer guidance should use `okfh evidence "<question>" --json` as the default retrieval step once v0.4 ships. Search and read remain lower-level tools, but the normal answer workflow should become status or check when needed, evidence brief, bounded continuation read when needed, then answer with explicit evidence limits.
