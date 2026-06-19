# OKF Harness 工作流

OKF Harness 是为通过 Claude Code 或 Codex 操作的人设计的。CLI 仍然可见，但日常工作从 agent 开始。

这个工作流遵循 Andrej Karpathy 的 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式，并使用 Google 的 [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) 作为 bundle 格式。

OKF Harness 是独立项目，与 Andrej Karpathy 或 Google 没有关联，也不代表其背书。

[English](../WORKFLOWS.md) | 中文

## Workspace 模型

按知识领域、研究方向或隐私边界各建一个 workspace。几个合适的例子：

- `~/Documents/OKF Harness/ai-research`
- `~/Documents/OKF Harness/company-strategy`
- `~/Documents/OKF Harness/personal-health-reading`

Windows 下按同样习惯放在 `%USERPROFILE%\Documents\OKF Harness\...`。

不要用一个隐藏的全局知识库。分离 workspace 能让 agent 提示更清晰、隐私内容隔离，check 和搜索输出也更容易信任。

## 开始之前

在本地终端运行一次：

```bash
npm install -g @okf-harness/cli
okfh doctor --json
mkdir -p "$HOME/Documents/OKF Harness"
```

普通使用需要 macOS、Windows 或 Linux、Node.js 22 或更高版本、git，以及 `@okf-harness/cli`。`pnpm` 只用于仓库开发。

你也可以让 agent 检查本机是否已经安装 `okfh`。如果 agent 需要安装全局 npm 包，必须先得到你的明确同意。

## 从你的 agent 开始

使用当前 agent 的 OKF Harness 前缀。

还没有 workspace：

Codex：

```text
$okf-harness Set up a workspace for my AI research notes in my Documents folder, then check that this agent can use it.
```

Claude Code：

```text
/okf-harness Set up a workspace for my AI research notes in my Documents folder, then check that this agent can use it.
```

Agent 应调用 `okfh init`，并传入当前 agent 对应的 adapter：Codex 使用 `--agents codex`，Claude Code 使用 `--agents claude`。只有在你明确要求同时准备两个 agent 时，才使用 `--agents all`。

设置完成后，agent 应运行 `okfh status --workspace <workspace> --json`，并提醒你开启新的 Codex thread 或 Claude Code session，让客户端加载新的指引。

## 添加资料

Codex：

```text
$okf-harness Add ~/Downloads/llm-wiki-note.md to this workspace, update the wiki with citations, then check the workspace again.
```

Claude Code：

```text
/okf-harness Add ~/Downloads/llm-wiki-note.md to this workspace, update the wiki with citations, then check the workspace again.
```

Agent 应调用：

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

然后 agent 读取已注册的原始资料，编写或更新参考页面和主题页面，更新索引和日志，最后运行 check。

原始资料不应在原位编辑。如果资料需要修正，注册一份新的来源。

## 提问

Codex：

```text
$okf-harness What does my workspace say about LLM Wiki structure?
```

Claude Code：

```text
/okf-harness What does my workspace say about LLM Wiki structure?
```

Agent 应调用：

```bash
okfh status --workspace <workspace> --json
okfh read index --workspace <workspace> --json
okfh search "<question>" --workspace <workspace> --json
okfh read <concept-id-or-path> --workspace <workspace> --json
```

当前 CLI 没有 `okfh query` 命令。agent 通过组合搜索候选卡片和受控读取来组织答案。当证据仅来自 wiki 页面而非原始资料正文时，agent 应明确说明。

## 维护 Workspace

Codex：

```text
$okf-harness Check this workspace and tell me whether it is ready.
```

Claude Code：

```text
/okf-harness Check this workspace and tell me whether it is ready.
```

Agent 应调用：

```bash
okfh check --workspace <workspace> --json
```

`check` 会报告 `ready`、`needs_attention` 或 `blocked`。它会区分 OKF 合规和 Harness lint，所以断链或缺引用不会被说成 OKF 规范失败。每次编辑 wiki 后，agent 应再次运行 check 并展示变更的文件。

## 生成图谱

Codex：

```text
$okf-harness Generate the local graph report for this workspace and tell me where the HTML file is.
```

Claude Code：

```text
/okf-harness Generate the local graph report for this workspace and tell me where the HTML file is.
```

Agent 应调用：

```bash
okfh graph --workspace <workspace> --json
```

仅在你希望操作系统用默认浏览器打开 HTML 报告时使用 `--open`。如果 Linux 环境没有 GUI 或 opener 命令，手动打开生成的 HTML 文件即可。

## 修复 Agent 支持

如果 workspace 已存在，但当前 agent 没有发现 OKF Harness 指引，通过同一个前缀告诉它：

```text
$okf-harness Repair this workspace's OKF Harness support for Codex.
```

```text
/okf-harness Repair this workspace's OKF Harness support for Claude Code.
```

Agent 默认只修复当前 adapter：

```bash
okfh agent install codex --workspace <workspace> --json
okfh agent install claude --workspace <workspace> --json
```

使用与当前 agent 匹配的那条命令。只有在你明确要求同时准备两个 adapter 时，才使用 `all`。仅在检查冲突后使用 `--force`。

## 文件结构

```text
raw/inbox/        临时存放未注册材料的地方
raw/sources/      已注册的原始资料，视为不可变
wiki/             整理后的 OKF markdown 概念文档
.okfh/manifest    来源登记表，含哈希和来源 ID
.okfh/reports/    生成的报告，如图谱 graph.html
AGENTS.md         Codex workspace 指引
CLAUDE.md         Claude Code workspace 指引
```

## 设计克制

OKF Harness 保持本地化、可检查，并且可以通过普通终端命令调试。Agent 回答来自已整理的 `wiki/` 内容和受控读取；GUI、云端同步、来源连接器、向量检索和 Obsidian 辅助等更宽的产品面，会留在路线图中，直到它们能保留这些保证。
