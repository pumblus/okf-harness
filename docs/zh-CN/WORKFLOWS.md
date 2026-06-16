# OKF Harness 工作流

OKF Harness 是为通过 Claude Code 或 Codex 操作的人设计的。CLI 仍然可见，但日常工作应从自然语言开始。

这个工作流遵循 [Andrej Karpathy 的 LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式，并使用 Google 的 [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) 作为 bundle 格式。

OKF Harness 是独立项目，与 Andrej Karpathy 或 Google 没有关联，也不代表其背书。

[English](../WORKFLOWS.md) | 中文

## Workspace 模型

按知识领域、研究方向或隐私边界各建一个 workspace。几个合适的例子：

- `~/Documents/OKF Harness/ai-research`
- `~/Documents/OKF Harness/company-strategy`
- `~/Documents/OKF Harness/personal-health-reading`

不要用一个隐藏的全局知识库。分离 workspace 能让 agent 提示更清晰、隐私内容隔离，lint 和搜索输出也更容易信任。

## 初次设置

在 Mac 上运行一次：

```bash
npm install -g @okf-harness/cli
okfh doctor --json
mkdir -p "$HOME/Documents/OKF Harness"
```

然后创建 workspace：

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents all --git --json
```

在 Claude Code 或 Codex 中打开 workspace 文件夹。生成的适配文件会教 agent 如何使用 `okfh --json`。

## 让 Agent 帮你建 Workspace

也可以直接对 agent 说：

```text
Set up an OKF Harness workspace for my AI research notes under ~/Documents/OKF Harness. Use the default structure, install Claude and Codex support, initialize git, and tell me how to add my first source.
```

Agent 应调用：

```bash
okfh init <workspace> --name <name> --agents all --git --json
okfh status --workspace <workspace> --json
```

## 添加资料

对 agent 说：

```text
Add ~/Downloads/llm-wiki-note.md to this OKF Harness workspace, create an ingest plan, and update only the relevant wiki pages with citations.
```

Agent 应调用：

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

然后 agent 读取已注册的原始资料，编写或更新参考页面和主题页面，更新索引和日志，最后运行 lint。

原始资料不应在原位编辑。如果资料需要修正，注册一份新的来源。

## 提问

对 agent 说：

```text
What does my AI Research wiki say about the LLM Wiki structure? Search and read the wiki before answering, and cite the concept paths you used.
```

Agent 应调用：

```bash
okfh status --json
okfh read index --json
okfh search "<question>" --json
okfh read <concept-id-or-path> --json
```

当前 CLI 没有 `okfh query` 命令。agent 通过组合搜索候选卡片和受控读取来组织答案。当证据仅来自 wiki 页面而非原始资料正文时，agent 应明确说明。

## 维护 Workspace

对 agent 说：

```text
Check this OKF Harness workspace for broken links, missing citations, source hash drift, and manifest problems. Fix small wiki issues if they are clear.
```

Agent 应调用：

```bash
okfh lint --json
```

每次编辑 wiki 后应再次运行 lint 并展示变更的文件。

## 生成图谱

对 agent 说：

```text
Generate the local graph report for this workspace and tell me where the HTML file is.
```

Agent 应调用：

```bash
okfh graph --json
```

仅在你希望 macOS 打开 HTML 报告时使用 `--open`。

## 修复 Agent 支持

如果 workspace 已存在但 Claude Code 或 Codex 没有发现 OKF Harness 的指引，对 agent 说：

```text
Repair Claude Code and Codex support for this OKF Harness workspace.
```

Agent 应调用：

```bash
okfh agent install all --workspace <workspace> --json
```

仅在检查冲突后使用 `--force`。

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

OKF Harness 保持本地化、可检查，并且可以通过普通终端命令调试。Agent 回答来自已整理的 `wiki/` 内容和受控读取；GUI、云端同步、来源连接器、向量检索、Obsidian 辅助和跨平台支持等更宽的产品面，会留在路线图中，直到它们能保留这些保证。
