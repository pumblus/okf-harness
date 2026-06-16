# 安全策略

OKF Harness 是本地优先的。v0.1 不运行云端服务、不创建账户、不上传资料、不启动后台守护进程。

[English](../SECURITY.md) | 中文

## 支持范围

安全报告应关注当前 v0.1 的以下方面：

- `okfh` CLI 行为
- workspace 路径安全
- 来源注册和 manifest 完整性
- 原始资料的不可变边界
- 生成的 Claude Code 和 Codex 指引
- 图谱报告生成
- 本地文件写入边界
- `@okf-harness/core`、`@okf-harness/cli` 和 `@okf-harness/agent-pack` 的包内容

MCP、Obsidian、GUI、云端同步、网页抓取、账户和跨平台行为不在 v0.1 运行时范围内。

## 本地数据边界

OKF Harness 仅在你指定的 workspace 内写入：

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

当你使用 `--git` 时，它也可能在 workspace 中初始化 git。

`okfh source add <file>` 将源文件复制到 `raw/sources/YYYY/MM/` 并在 `.okfh/manifest.jsonl` 中记录哈希。它不会移动或改写原始文件。

`okfh source add <url>` 记录一个 URL 来源指针。v0.1 不会抓取网页正文或创建网页快照。

`okfh graph` 在 `.okfh/` 下生成本地图谱文件。

## 原始资料

已注册的原始资料视为不可变证据。如果材料有变化，应作为新来源添加，而不是编辑 `raw/sources/` 中的已有文件。

如果某个命令或生成的 agent 工作流在 `raw/sources/` 中原地修改了文件，应视为 bug。

## 密钥和凭证

不要在以下位置存放 API key、访问 token、凭证或私有服务 cookie：

- `okfh.config.yaml`
- agent 指引文件
- `.okfh/manifest.jsonl`
- wiki markdown
- issue 报告
- pull request

本地开发密钥使用环境变量。生成的 gitignore 已经排除了 `.env` 和 `.env.*`。

## 报告漏洞

在可用时使用本仓库的 GitHub Security Advisories。如果该功能不可用，开一个最小化的公开 issue 说明需要私下报告安全问题，但不要在 issue 中包含漏洞细节或私有资料。

有用的报告应包含：

- 受影响的命令或生成文件
- 操作系统和 Node.js 版本
- 你运行的确切命令
- 预期行为
- 实际行为
- 资料、workspace 文件或 workspace 外部路径是否受到影响

不要附上私有文档、资料来源、凭证或完整的本地 workspace 归档。

## 非安全问题

以下情况通常属于普通 bug，不是安全漏洞：

- CLI 输出令人困惑
- 文档缺失
- lint 警告
- 不支持的 Windows 或 Linux 行为
- 缺失的 Obsidian 行为
- 搜索排序质量
- 计划中的 MCP 功能尚未可用
