# OKF Harness CLI

npm 包名为 `@okf-harness/cli`。安装后可用 `okfh` 命令，也提供了 `okf-harness` 这个更长的别名。文档统一使用 `okfh`。

[English](../CLI.md) | 中文

## 安装

```bash
npm install -g @okf-harness/cli
okfh doctor --json
```

不全局安装的试用方式：

```bash
npx --package @okf-harness/cli okfh doctor --json
```

环境要求：

- macOS、Windows 或 Linux
- Node.js 22 或更高版本
- git
- 参与仓库开发需要 pnpm

## Workspace 规则

按知识领域、研究方向或隐私边界各建一个 workspace。推荐父目录只是文档约定，OKF Harness 不会从这里解析隐藏的全局 workspace。

| 环境 | 推荐父目录 |
|---|---|
| macOS 或 Linux shell | `$HOME/Documents/OKF Harness` |
| Windows PowerShell | `$env:USERPROFILE\Documents\OKF Harness` |
| Windows Command Prompt | `%USERPROFILE%\Documents\OKF Harness` |

大多数命令通过 `--workspace <path>` 或从当前目录向上查找最近的 `okfh.config.yaml` 来定位 workspace。涉及修改资料来源的命令需要明确指定 workspace 路径，避免把文件注册到错误的文件夹。

## JSON 格式

支持 `--json` 的命令返回统一格式：

```json
{
  "ok": true,
  "command": "status",
  "workspace": "/absolute/workspace/path",
  "data": {},
  "warnings": [],
  "next": []
}
```

失败时使用同样的格式，`ok` 为 `false`，并附带 `error` 对象。agent 指引应依赖这个 JSON 约定，而不是解析人类可读的终端输出。

## 命令

### doctor

检查 CLI 运行环境、Node.js、git、pnpm，以及可解析到 workspace 时的 workspace 就绪状态。

```bash
okfh doctor --json
okfh doctor --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

`doctor` 不会写入任何文件。

### init

创建 workspace，可选渲染 Claude Code 和 Codex 的适配文件。

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents all --git --json
```

选项：

- `--name <name>` 必填。
- `--agents all|claude|codex|none|claude,codex` 控制适配文件的渲染。
- `--git` 初始化 git 仓库但不提交。
- `--dry-run` 返回计划的写入内容，不实际创建文件。

### agent install

在已有 workspace 中安装或修复 Claude Code 和 Codex 的适配文件。

```bash
okfh agent install all --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install claude --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install codex --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

用 `--dry-run` 查看计划写入的内容。仅在检查冲突后使用 `--force`。

### status

报告 workspace 初始化状态、wiki 文件数量、概念数量、lint 状态和可用能力。

```bash
okfh status --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

当前 CLI 可用能力包括 `search`、`read` 和 `graph`。没有 `okfh query` 命令。

### lint

检查 OKF frontmatter、保留文件、日志标题、断链、缺失的索引条目、缺失的引用段落、manifest 行、来源哈希漂移、缺失的来源和未注册的原始资料文件。

```bash
okfh lint --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

`lint` 报告警告和错误。有错误时 `ok` 为 `false`。

### source add

将本地文件或 URL 指针注册为资料来源。

```bash
okfh source add ~/Downloads/paper.pdf --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh source add https://example.com/article --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

文件来源会被复制到 `raw/sources/YYYY/MM/` 下，并在 `.okfh/manifest.jsonl` 中记录 SHA-256 哈希。URL 来源将 URL 记录为来源指针。当前 CLI 不会自动抓取网页内容。

用 `--dry-run` 查看计划注册的来源记录，不实际写入。

### source list

列出已注册的来源记录。

```bash
okfh source list --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

### ingest plan

为 agent 生成一份确定性的 checklist，指导如何将已注册的来源整理到 wiki 中。

```bash
okfh ingest plan src_20260615_0001 --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

plan 仅使用元数据。agent 在撰写 wiki 内容之前必须读取来源正文。

### search

搜索 wiki 中已整理的概念文档。不会搜索原始资料。

```bash
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh search "type:Topic LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --limit 20 --json
```

支持的过滤条件：

- `type:<value>`
- `tag:<value>`
- `path:<prefix>`

搜索结果是指向候选文档的卡片，不是最终证据。在回答之前使用 `read` 确认内容。

### read

按概念 ID、路径、`index` 或 `log` 读取 wiki 文档，输出长度受控。

```bash
okfh read index --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read topics/llm-wiki --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read wiki/topics/llm-wiki.md --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

选项：

- `--section <heading>` 按标题读取指定段落
- `--section-id <id>` 按稳定段落 ID 读取
- `--offset <number> --limit <number>` 按范围读取
- `--full` 显式请求完整读取（仍受上限控制）

内容被截断时，JSON 响应会告知 agent 如何继续。

### graph

构建反向链接数据和自包含的本地 HTML 图谱报告。

```bash
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --open --json
```

报告写入 `.okfh/reports/graph.html`。图谱不会上传任何数据。

`--open` 会请求操作系统用默认浏览器或 HTML 处理程序打开报告。如果 Linux 环境没有 GUI 或 opener 命令，OKF Harness 仍会写入报告，并返回清楚的错误，提示你手动打开 HTML 文件。

## 退出行为

成功的命令返回退出码 `0`。验证失败、workspace 问题、来源问题或 lint 错误返回非零退出码，带 `--json` 时 JSON 中包含 `ok: false`。

## 从源码安装（开发者）

用于仓库开发：

```bash
pnpm install
pnpm build
node packages/cli/dist/main.js doctor --json
```
