# Route answer workflows through evidence briefs

Claude and Codex answer guidance uses `okfh evidence "<question>" --json` as the default retrieval step. Search and read remain lower-level tools, and the normal answer workflow is status or check when needed, evidence brief, bounded continuation read when needed, then answer with explicit evidence limits.
