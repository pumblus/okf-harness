# Use a scoped npm CLI package

_Status: package naming remains active; global CLI install guidance is superseded by the product-form migration in #90 — README routes ordinary users through universal setup and the pinned runtime launcher instead of a global `okfh` install._

OKF Harness uses `@okf-harness/cli` as the workspace runtime package that exposes the `okfh` command, while `@okf-harness/core` and `@okf-harness/agent-pack` remain package-family members published for reuse. This keeps the release shape honest for a monorepo, while public docs route ordinary users through universal setup and the pinned runtime launcher.
