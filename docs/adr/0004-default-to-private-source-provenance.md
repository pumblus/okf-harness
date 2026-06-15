# Default to private source provenance

OKF Harness source manifests should not store local absolute file paths by default. Raw source identity is preserved through the workspace-relative raw source path and content hash, while provenance records keep only non-sensitive origin labels for local files; this avoids leaking usernames, client names, or private directory structures when a workspace is shared or committed.
