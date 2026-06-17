# Security Policy

English | [中文](docs/zh-CN/SECURITY.md)

OKF Harness is local-first. Its current runtime surface is the local CLI and the workspace files it writes; cloud services, accounts, source uploads, and background daemons are not part of that surface.

## Supported Scope

Security reports should focus on the current runtime surfaces:

- `okfh` CLI behavior
- workspace path safety
- source registration and manifest integrity
- raw source immutability boundaries
- generated Claude Code and Codex guidance
- graph report generation
- local file write boundaries
- package contents for `@okf-harness/core`, `@okf-harness/cli`, and `@okf-harness/agent-pack`

Reports about Obsidian, GUI, cloud sync, web crawling, or accounts should start as roadmap or design discussions unless they affect the runtime surfaces above.

## Local Data Boundaries

OKF Harness writes inside the workspace you choose:

```text
AGENTS.md
CLAUDE.md
okfh.config.yaml
.agents/
.claude/
.codex/
raw/
wiki/
.okfh/
.gitignore
```

It may also initialize git in that workspace when you pass `--git`.

`okfh source add <file>` copies a source file into `raw/sources/YYYY/MM/` and records a hash in `.okfh/manifest.jsonl`. It does not move or rewrite the original file.

`okfh source add <url>` records a URL source pointer only. Save and register webpage content separately when a durable snapshot is required.

`okfh graph` writes local graph artifacts under `.okfh/`.

## Raw Sources

Registered raw sources are treated as immutable evidence. If material changes, add it as a new source instead of editing the existing file in `raw/sources/`.

If a command or generated agent workflow modifies `raw/sources/` in place, treat that as a bug.

## Secrets

Do not put API keys, access tokens, credentials, or private service cookies in:

- `okfh.config.yaml`
- agent guidance files
- `.okfh/manifest.jsonl`
- wiki markdown
- issue reports
- pull requests

Use environment variables for local development secrets. The generated gitignore excludes `.env` and `.env.*`.

## Reporting A Vulnerability

For sensitive reports, email `eric.zhou.0921@gmail.com` before using any public channel. Use this subject format:

```text
[OKF Harness Security] <short summary>
```

For non-sensitive vulnerability reports, use GitHub Security Advisories when available. Public issues are only a last-resort coordination channel: open a minimal issue that says a private security report is needed, but do not include exploit details, private source material, or credentials.

In a useful report, include:

- affected command or generated file
- operating system and Node.js version
- exact command you ran
- expected behavior
- actual behavior
- whether source material, workspace files, or paths outside the workspace were affected

Do not attach private documents, source material, credentials, or full local workspace archives.

## Non-Security Issues

These are usually regular bugs, not security vulnerabilities:

- confusing CLI output
- missing docs
- lint warnings
- unsupported operating system or terminal combinations
- missing Obsidian behavior
- search ranking quality
