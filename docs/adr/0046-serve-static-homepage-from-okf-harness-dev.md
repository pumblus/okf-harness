# Serve a static homepage from okf-harness.dev

OKF Harness should use `https://okf-harness.dev/` as a small static public homepage that explains the product boundary and routes people to install, docs, and the repository, instead of redirecting the root path to GitHub. This supersedes ADR 0041 only for the root path: `https://okf-harness.dev/install.sh` and `https://okf-harness.dev/install.ps1` remain short installer URLs backed by auditable GitHub Release assets.
