# Architecture Decision Records

Each ADR is a short record of one durable OKF Harness product decision. Read the ADRs that cover the area you are changing; the filename states the decision, and a `_Status:` line directly after the title states when a decision was superseded or narrowed.

## Conventions

- Number sequentially (`NNNN`); never renumber, rename, or delete an existing ADR.
- One decision per file; keep the record short.
- When a decision is superseded or narrowed, add a `_Status:` line after the title naming what replaced it, and keep the original record intact for history.
- Durable decisions live here; committed release work lives in version PRDs and issues (ADR 0031), and the roadmap stays for uncommitted demand (ADR 0030).

## Index

| ADR | Decision | Status |
|---|---|---|
| 0001 | Use terminal-native tool channel by default | Active |
| 0002 | Use harness-managed guidance blocks | Active |
| 0003 | Use shared agent skill templates | Active |
| 0004 | Default to private source provenance | Active |
| 0005 | Use deterministic wiki search by default | Active |
| 0006 | Use a scoped npm CLI package | Partially superseded |
| 0007 | Use domain-scoped local workspaces | Partially superseded |
| 0008 | Use check as the validation workflow | Active |
| 0009 | Use a unified agent entrypoint | Active |
| 0010 | Use Markdown sources for agent skills | Active |
| 0011 | Use wiki excerpts for evidence briefs | Active |
| 0012 | Bound answer follow-ups to continuation cues | Active |
| 0013 | Use the index document as evidence navigation | Active |
| 0014 | Leave evidence sufficiency to agents | Active |
| 0015 | Keep raw sources out of answer workflows | Active |
| 0016 | Use the short evidence command | Active |
| 0017 | Use character budgets for evidence | Active |
| 0018 | Keep unselected evidence candidates thin | Active |
| 0019 | Prefer section excerpts for evidence | Active |
| 0020 | Leave evidence conflict judgment to agents | Active |
| 0021 | Include provenance pointers in evidence | Active |
| 0022 | Treat empty evidence as success | Active |
| 0023 | Use item numbers, not confidence scores | Active |
| 0024 | Use mechanical match reasons | Active |
| 0025 | Echo the evidence question | Active |
| 0026 | Keep evidence guidance short | Active |
| 0027 | Expose check risk without requiring clean checks | Active |
| 0028 | Route answer workflows through evidence briefs | Active |
| 0029 | Keep search and read as public tools | Active |
| 0030 | Keep committed work out of roadmap | Active |
| 0031 | Use version PRDs and issues for committed work | Active |
| 0032 | Validate evidence through agent answer workflows | Active |
| 0033 | Dogfood evidence on OKF Harness design | Active |
| 0034 | Keep dogfood workspaces out of public examples | Active |
| 0035 | Auto-install global bootstrap entrypoints | Superseded |
| 0036 | Keep first useful loop workspace-local | Active |
| 0037 | Use workspace next steps in CLI output | Active |
| 0038 | Use metadata-only new concept suggestions in ingest plans | Active |
| 0039 | Prepare agent adapters without a plugin system | Active |
| 0040 | Ship native agent integrations from the main repository | Active |
| 0041 | Use short installer URLs backed by auditable script sources | Partially superseded |
| 0042 | Use a dedicated setup package for the recommended install path | Partially superseded |
| 0043 | Install the global runtime from setup | Superseded |
| 0044 | Use native-supported levels for v0.6 agent integrations | Active |
| 0045 | Use host-native install identifiers for agent integrations | Partially superseded |
| 0046 | Serve a static homepage from okf-harness.dev | Active |
| 0047 | Host the public homepage on Cloudflare Pages | Active |
| 0048 | Admit self-authored knowledge with zero anchors | Active |
| 0049 | Gate the write-back offer on a proven coverage gap | Active |

Superseded decisions were replaced in full; partially superseded decisions keep part of their scope active, as stated in their `_Status:` lines.
