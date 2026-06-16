# Security Policy

English | [中文](docs/zh-CN/SECURITY.md)

OKF Harness is local-first. v0.1 does not run a cloud service, create accounts, upload source material, or start a background daemon.

## Supported Scope

Security reports should focus on the current v0.1 surfaces:

- `okfh` CLI behavior
- workspace path safety
- source registration and manifest integrity
- raw source immutability boundaries
- generated Claude Code and Codex guidance
- graph report generation
- local file write boundaries
- package contents for `@okf-harness/core`, `@okf-harness/cli`, and `@okf-harness/agent-pack`

MCP, Obsidian, GUI, cloud sync, web crawling, accounts, and cross-platform behavior are not v0.1 runtime surfaces.

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

`okfh source add <url>` records a URL source pointer. v0.1 does not fetch the webpage body or create a webpage snapshot.

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

Use GitHub Security Advisories for this repository when available. If that is not available, open a minimal public issue that says a private security report is needed, but do not include exploit details or private source material.

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
- unsupported Windows or Linux behavior
- missing Obsidian behavior
- search ranking quality
- planned MCP features not being available
