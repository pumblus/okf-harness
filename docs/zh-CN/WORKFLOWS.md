# OKF Harness 工作流

OKF Harness 是为通过 Claude Code 或 Codex 操作的人设计的。CLI 仍然可见，但日常工作应从自然语言开始。

这个工作流遵循 Andrej Karpathy 的 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式，并使用 Google 的 [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) 作为 bundle 格式。

OKF Harness 是独立项目，与 Andrej Karpathy 或 Google 没有关联，也不代表其背书。

[English](../WORKFLOWS.md) | 中文

## Workspace 模型

按知识领域、研究方向或隐私边界各建一个 workspace。几个合适的例子：

- `~/Documents/OKF Harness/ai-research`
- `~/Documents/OKF Harness/company-strategy`
- `~/Documents/OKF Harness/personal-health-reading`

Windows 下按同样习惯放在 `%USERPROFILE%\Documents\OKF Harness\...`。

不要用一个隐藏的全局知识库。分离 workspace 能让 agent 提示更清晰、隐私内容隔离，lint 和搜索输出也更容易信任。

## 初次设置

在本地终端运行一次：

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
在 ~/Documents/OKF Harness 下为我的 AI 研究笔记创建一个 OKF Harness workspace。使用默认结构，安装 Claude 和 Codex 支持，初始化 git，然后告诉我怎么添加第一份资料。
```

Agent 应调用：

```bash
okfh init <workspace> --name <name> --agents all --git --json
okfh status --workspace <workspace> --json
```

## 添加资料

对 agent 说：

```text
把 ~/Downloads/llm-wiki-note.md 加到这个 OKF Harness workspace，生成 ingest plan，然后只更新相关 wiki 页面并加上引用。
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
我的 AI Research wiki 里是怎么记录 LLM Wiki 结构的？先搜索并读取 wiki，再回答我，并标出你用到的概念路径。
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
检查这个 OKF Harness workspace 有没有断链、缺失引用、来源哈希漂移和 manifest 问题。如果小的 wiki 问题很明确，就直接修。
```

Agent 应调用：

```bash
okfh lint --json
```

每次编辑 wiki 后应再次运行 lint 并展示变更的文件。

## 生成图谱

对 agent 说：

```text
为这个 workspace 生成本地图谱报告，并告诉我 HTML 文件在哪里。
```

Agent 应调用：

```bash
okfh graph --json
```

仅在你希望操作系统用默认浏览器打开 HTML 报告时使用 `--open`。如果 Linux 环境没有 GUI 或 opener 命令，手动打开生成的 HTML 文件即可。

## 修复 Agent 支持

如果 workspace 已存在但 Claude Code 或 Codex 没有发现 OKF Harness 的指引，对 agent 说：

```text
修复这个 OKF Harness workspace 的 Claude Code 和 Codex 支持。
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

OKF Harness 保持本地化、可检查，并且可以通过普通终端命令调试。Agent 回答来自已整理的 `wiki/` 内容和受控读取；GUI、云端同步、来源连接器、向量检索和 Obsidian 辅助等更宽的产品面，会留在路线图中，直到它们能保留这些保证。
