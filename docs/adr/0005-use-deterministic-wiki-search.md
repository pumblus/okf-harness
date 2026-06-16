# Use deterministic wiki search by default

OKF Harness search operates over the [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) bundle with deterministic metadata and markdown matching instead of embeddings, RAG, or raw-source-wide discovery. This keeps query behavior local, explainable, and aligned with [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern: the harness finds candidate concept documents, then the agent reads full pages and cites the wiki evidence.
