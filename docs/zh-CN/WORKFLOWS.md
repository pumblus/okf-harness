# OKF Harness 工作流

OKF Harness 是为通过 Claude Code 或 Codex 操作的人设计的。CLI 仍然可见，但日常工作从智能体（Agent）开始。

这个工作流遵循 Andrej Karpathy 的 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式，并使用 Google 的 [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) 作为 bundle 格式。

OKF Harness 是独立项目，与 Andrej Karpathy 或 Google 没有关联，也不代表其背书。

[English](../WORKFLOWS.md) | 中文

## 工作区模型

按知识领域、研究方向或隐私边界各建一个工作区（Workspace）。几个合适的例子：

- `~/Documents/OKF Harness/ai-research`
- `~/Documents/OKF Harness/company-strategy`
- `~/Documents/OKF Harness/personal-health-reading`

Windows 下按同样习惯放在 `%USERPROFILE%\Documents\OKF Harness\...`。

不要用一个隐藏的全局知识库。分离工作区能让智能体提示更清晰、隐私内容隔离，check 和搜索输出也更容易信任。

## 开始之前

在本地终端运行一次：

```bash
npm install -g @okf-harness/cli
```

普通使用需要 macOS、Windows 或 Linux、Node.js 22 或更高版本、git，以及 `@okf-harness/cli`。`pnpm` 只用于仓库开发。

包安装时会尽量为检测到的 Codex 和 Claude Code 安装受管理的全局引导入口（Global bootstrap entrypoint）。你也可以让智能体检查本机是否已经安装 `okfh`。如果智能体需要安装全局 npm 包，必须先得到你的明确同意。

## 从你的智能体开始

使用当前智能体的 OKF Harness 前缀。还没有工作区时，使用全局引导入口。完成设置或选择工作区后，在工作区内使用工作区本地入口（Workspace-local entrypoint）。

还没有工作区：

Codex：

```text
$okf-harness-bootstrap 在我的 Documents 文件夹中为我的 AI 研究笔记设置一个工作区，然后告诉我如何刷新当前智能体上下文。
```

Claude Code：

```text
/okf-harness-bootstrap 在我的 Documents 文件夹中为我的 AI 研究笔记设置一个工作区，然后告诉我如何刷新当前智能体上下文。
```

全局引导入口会先从浅层本地工作区集合（Workspace collection）中发现或选择已有工作区。没有选中工作区时，再进入当前智能体设置（Current-agent setup）：推断显示名称和目标目录；细节缺失或有歧义时先询问，再做持久写入；没有明确说明 Git 选择时先确认；然后调用 `okfh init`，并传入当前智能体对应的适配器（Adapter）：Codex 使用 `--agents codex`，Claude Code 使用 `--agents claude`。只有在你明确要求同时准备两个受支持智能体时，才使用 `--agents all`。

设置完成后，全局引导入口会修复当前智能体的工作区本地入口，并返回智能体上下文刷新（Agent context refresh）提示。通常是让你从工作区文件夹开启新的 Codex thread 或 Claude Code session，让客户端加载新的指引。

全局引导入口不是日常工作流。它不应整理 Wiki 内容、迁移非空的非工作区目录、写入全局根指引文件，或承诺不支持的智能体客户端。

要端到端检查首次启动，可以按这五步操作：

1. 在干净环境中安装 CLI。
2. 打开 Codex 或 Claude Code。
3. 确认当前智能体能发现 `okf-harness-bootstrap`。
4. 用它为当前智能体创建一个空工作区。
5. 按刷新指引操作，并确认从工作区文件夹能使用工作区本地的 `okf-harness` 入口。

## 添加资料

Codex：

```text
$okf-harness 将 ~/Downloads/llm-wiki-note.md 添加到这个工作区，更新 Wiki 并加上引用，然后再次检查工作区。
```

Claude Code：

```text
/okf-harness 将 ~/Downloads/llm-wiki-note.md 添加到这个工作区，更新 Wiki 并加上引用，然后再次检查工作区。
```

智能体应调用：

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

然后智能体读取已注册的原始资料，编写或更新参考页面和主题页面，更新索引和日志，最后运行 check。

原始资料不应在原位编辑。如果资料需要修正，注册一份新的来源。

### 首个有效闭环

首个有效闭环从本地资料开始。先注册一份本地文件，让智能体基于已注册来源整理 Wiki 页面，运行 `okfh check --workspace <workspace> --json`，然后做 first-answer check：这份来源主要讲什么、关键结论是什么、证据来自哪里。

URL 来源只作为来源指针保存。OKF Harness 会记录 URL，但不会自动抓取网页内容。

`okfh status` 和 `okfh check` 可以在 JSON 的 `next` 中返回工作区下一步，人类可读输出也可以把它显示为 `Next: ...`。把这行当作这个闭环里给智能体的下一条提示：添加一份本地来源文件、把网页内容保存成本地文件而不是只依赖 URL 指针、带引用更新 Wiki、处理 check 发现的问题，或执行 first-answer check。CLI 只报告下一步；它不会抓取网页、自动修复问题、给内容质量打语义分，或替你整理 Wiki 页面。

## 提问

Codex：

```text
$okf-harness 我的工作区里是如何描述 LLM Wiki 结构的？
```

Claude Code：

```text
/okf-harness 我的工作区里是如何描述 LLM Wiki 结构的？
```

智能体应调用：

```bash
okfh status --workspace <workspace> --json
okfh evidence "<question>" --workspace <workspace> --json
# 可选，仅在 evidence 结果给出且确实需要续读时使用：
okfh read <concept-id-or-path> --workspace <workspace> --offset <offset> --limit <limit> --json
```

当前 CLI 没有 `okfh query` 命令。智能体先准备证据摘要（Evidence Brief），确认返回的问题和用户请求一致；必要时最多跟随一次受控续读提示；然后回答，或说明证据缺失、偏弱、被截断，或引用不足。

常规回答使用已整理的 `wiki/` 内容。除非你明确要求做来源审计或 ingest，智能体不应读取 `raw/` 原始资料正文。`search` 和 `read` 仍可用于调试检索、查看候选文档和受控续读，但不再是默认问答起点。

## 维护工作区

Codex：

```text
$okf-harness 检查这个工作区，并告诉我它是否已经就绪。
```

Claude Code：

```text
/okf-harness 检查这个工作区，并告诉我它是否已经就绪。
```

智能体应调用：

```bash
okfh check --workspace <workspace> --json
```

`check` 会报告 `ready`、`needs_attention` 或 `blocked`。它会区分 OKF 合规和 Harness lint，所以断链或缺引用不会被说成 OKF 规范失败。每次编辑 Wiki 后，智能体应再次运行 check 并展示变更的文件。

## 生成图谱

Codex：

```text
$okf-harness 为这个工作区生成本地图谱报告，并告诉我 HTML 文件在哪里。
```

Claude Code：

```text
/okf-harness 为这个工作区生成本地图谱报告，并告诉我 HTML 文件在哪里。
```

智能体应调用：

```bash
okfh graph --workspace <workspace> --json
```

仅在你希望操作系统用默认浏览器打开 HTML 报告时使用 `--open`。如果 Linux 环境没有图形界面（GUI）或 opener 命令，手动打开生成的 HTML 文件即可。

## 修复智能体支持

如果工作区已存在，但当前智能体没有发现 OKF Harness 指引，通过同一个前缀告诉它：

```text
$okf-harness 修复这个工作区对 Codex 的 OKF Harness 支持。
```

```text
/okf-harness 修复这个工作区对 Claude Code 的 OKF Harness 支持。
```

智能体默认只修复当前适配器：

```bash
okfh agent install codex --workspace <workspace> --json
okfh agent install claude --workspace <workspace> --json
```

使用与当前智能体匹配的那条命令。只有在你明确要求同时准备两个适配器时，才使用 `all`。仅在检查冲突后使用 `--force`。

## 排查引导入口

如果 `$okf-harness-bootstrap` 或 `/okf-harness-bootstrap` 缺失、版本漂移，或被同名非受管理内容阻挡，运行：

```bash
okfh doctor --json
```

即使没有解析到工作区，`doctor` 也会报告全局引导状态。`okfh bootstrap status|repair --agents codex|claude|all --json` 是诊断或修复工具，不是主要的首次设置流程。

## 文件结构

```text
raw/inbox/        临时存放未注册材料的地方
raw/sources/      已注册的原始资料，视为不可变
wiki/             整理后的 OKF Markdown 概念文档
.okfh/manifest    来源登记表，含哈希和来源 ID
.okfh/reports/    生成的报告，如图谱 graph.html
AGENTS.md         Codex 工作区指引
CLAUDE.md         Claude Code 工作区指引
```

## 设计克制

OKF Harness 保持本地化、可检查，并且可以通过普通终端命令调试。智能体回答来自已整理的 `wiki/` 证据摘要，必要时再做受控续读；图形界面（GUI）、云端同步、来源连接器、向量检索和 Obsidian 辅助等更宽的产品面，会留在路线图中，直到它们能保留这些保证。
