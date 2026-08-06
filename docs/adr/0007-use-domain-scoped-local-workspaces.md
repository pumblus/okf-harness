# Use domain-scoped local workspaces

_Status: workspace scoping remains active; global CLI install guidance is superseded by the product-form migration in #90 — setup installs no global runtime, and each workspace reaches its pinned runtime through the launcher._

OKF Harness recommends one local workspace per knowledge domain, research area, or privacy boundary, with each workspace pinning the exact Harness runtime reached through the launcher. This follows the LLM Wiki and OKF bundle model: knowledge lives in portable directories, while the harness provides repeatable local tooling around each bundle instead of creating one hidden global knowledge base.
