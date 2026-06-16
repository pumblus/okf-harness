# Use deterministic wiki search for v0.1

OKF Harness v0.1 search operates over the OKF bundle with deterministic metadata and markdown matching instead of embeddings, RAG, or raw-source-wide discovery. This keeps query behavior local, explainable, and aligned with the agent-first workflow: the harness finds candidate concept documents, then the agent reads full pages and cites the wiki evidence.
