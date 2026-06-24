# OKF Harness CLI

npm 包名为 `@okf-harness/cli`。安装后可用 `okfh` 命令，也提供了 `okf-harness` 这个更长的别名。文档统一使用 `okfh`。

[English](../CLI.md) | 中文

## 安装

```bash
npm install -g @okf-harness/cli
```

临时诊断命令：

```bash
npx --package @okf-harness/cli okfh doctor --json
```

这不会添加全局 `okfh` 命令，但 npm 准备临时包时仍可能运行包安装钩子。

普通使用环境要求：

- macOS、Windows 或 Linux
- Node.js 22 或更高版本
- git
- `@okf-harness/cli`

参与仓库开发时额外需要 `pnpm`；用 `okfh doctor --dev --json` 检查开发环境。

普通首次设置应从 Codex 或 Claude Code 里的 `okf-harness-bootstrap` 全局引导入口（Global bootstrap entrypoint）开始。`okfh doctor --json` 和 `okfh bootstrap` 用于排查、诊断和修复。

## 工作区规则

按知识领域、研究方向或隐私边界各建一个工作区（Workspace）。推荐父目录只是文档约定，OKF Harness 不会从这里解析隐藏的全局工作区。

| 环境 | 推荐父目录 |
|---|---|
| macOS 或 Linux shell | `$HOME/Documents/OKF Harness` |
| Windows PowerShell | `$env:USERPROFILE\Documents\OKF Harness` |
| Windows Command Prompt | `%USERPROFILE%\Documents\OKF Harness` |

大多数命令通过 `--workspace <path>` 或从当前目录向上查找最近的 `okfh.config.yaml` 来定位工作区。涉及修改资料来源的命令需要明确指定工作区路径，避免把文件注册到错误的文件夹。

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

失败时使用同样的格式，`ok` 为 `false`，并附带 `error` 对象。智能体（Agent）指引应依赖这个 JSON 约定，而不是解析人类可读的终端输出。

## 命令

### doctor

检查 CLI 运行环境、Node.js、git、运行平台、全局引导状态，以及可解析到工作区时的工作区就绪状态。即使没有解析到工作区，也会运行全局引导检查。`pnpm` 只在参与仓库开发时需要，并由 `--dev` 检查。

```bash
okfh doctor --json
okfh doctor --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh doctor --dev --json
```

`doctor` 不会写入任何文件。

### init

创建工作区，可选渲染 Claude Code 和 Codex 的适配文件。

```bash
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents codex --git --json
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents claude --git --json
```

选项：

- `--name <name>` 必填。
- `--agents codex|claude|all|none|claude,codex` 必填，用来控制适配文件的渲染。
- `--git` 初始化 git 仓库但不提交。
- `--dry-run` 返回计划的写入内容，不实际创建文件。

使用当前智能体对应的适配器（Adapter）：Codex 使用 `codex`，Claude Code 使用 `claude`。只有明确需要两个受支持适配器时才使用 `all`。`none` 仅用于高级或开发场景。

### agent install

在已有工作区中安装或修复 Claude Code 和 Codex 的适配文件。

```bash
okfh agent install codex --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install claude --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh agent install all --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

默认使用当前智能体对应的适配器。只有明确需要两个受支持适配器时才使用 `all`。用 `--dry-run` 查看计划写入的内容。仅在检查冲突后使用 `--force`。

### bootstrap

诊断和修复受支持智能体的受管理全局引导入口。它不是主要的首次设置流程；常规设置从 Codex 的 `$okf-harness-bootstrap` 或 Claude Code 的 `/okf-harness-bootstrap` 开始。

```bash
okfh bootstrap install --agents codex --json
okfh bootstrap install --agents claude --json
okfh bootstrap install --agents all --json
okfh bootstrap status --agents codex --json
okfh bootstrap repair --agents codex --json
okfh bootstrap uninstall --agents codex --json
```

使用 `--agents codex`、`--agents claude` 或 `--agents all`。`status` 会报告 `missing`、`installed`、`version-drifted`、`unmanaged-conflict` 或 `unwritable-target`。`install` 和 `repair` 会创建缺失的受管理文件，或替换发生漂移的受管理文件；遇到同名非受管理内容会拒绝覆盖，遇到不可读或不可写的 bootstrap 目标会报告状态而不是抛出通用错误。`uninstall` 只删除受管理的 bootstrap 文件，遇到同名非受管理内容也会拒绝删除。对 `install`、`repair` 或 `uninstall` 使用 `--dry-run --json` 可以查看计划写入或删除的文件，不实际修改文件系统。

### status

报告工作区初始化状态、Wiki 文件数量、概念数量、简要 check 状态和可用能力。

```bash
okfh status --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

当前 CLI 可用能力包括 `evidence`、`search`、`read` 和 `graph`。没有 `okfh query` 命令。

### check

检查 OKF 合规状态和 OKF Harness 可维护性。

```bash
okfh check --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

`check` 在 `data.status` 下返回三种状态之一：

- `ready`：OKF 合规通过，Harness lint 没有发现问题。
- `needs_attention`：OKF 合规通过，但 Harness lint 发现可维护性或证据完整性问题。
- `blocked`：OKF 合规失败，工作区不是 OKF 可读取状态。

JSON 响应会在 `data.okfVersion` 中报告 OKF version，目前固定为 `0.1`。OKF 合规结果放在 `data.okfConformance`，Harness lint 结果放在 `data.harnessLint`。

`ready` 和 `needs_attention` 的顶层 `ok` 为 `true`，退出码为 `0`。`blocked` 的顶层 `ok` 为 `false`，退出码非 `0`。

### lint

`lint` 已不再是常规验证命令。它会提示调用方改用 `check`。

```bash
okfh lint --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

请改用 `okfh check --workspace <path> --json`。

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

为智能体生成一份确定性的清单，指导如何将已注册的来源整理到 Wiki 中。

```bash
okfh ingest plan src_20260615_0001 --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

整理计划（Ingest plan）仅使用元数据。智能体在撰写 Wiki 内容之前必须读取来源正文。

### search

搜索 Wiki 中已整理的概念文档。不会搜索原始资料。

```bash
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh search "type:Topic LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --limit 20 --json
```

支持的过滤条件：

- `type:<value>`
- `tag:<value>`
- `path:<prefix>`

搜索结果是指向候选文档的卡片，不是最终证据。回答前优先使用 `evidence` 准备受控证据摘要。

### evidence

从已整理的 Wiki 概念文档准备长度受控的证据摘要（Evidence Brief）。它不会直接回答问题，也不会搜索原始资料。

```bash
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --budget compact --json
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --max-chars 120000 --json
```

选项：

- `--budget compact|standard|large` 选择确定性的证据文本字符预算。当模型或智能体客户端上下文窗口大约为 256k、400k、1M 时，可分别选择 compact、standard、large。这只是选择建议，不是 token 估算，也不保证完整 JSON 一定放得进上下文窗口。
- `--max-chars <number>` 用显式证据文本字符上限覆盖 preset。

JSON 数据会回显问题，并返回 `budget`、选中的 `evidence`、轻量 `candidates`、`limits` 和短 `guidance`。只要工作区可读取，空证据也是成功结果：`ok` 仍为 `true`，`evidence` 为空，`limits` 中会出现机械性的 no-match 代码。

`limits` 只报告机械边界，比如没有匹配、内容被截断、工作区存在引用或溯源风险。证据是否足够回答，由智能体判断。证据项会在 `provenance` 下保留溯源指针：引用、引用问题、参考页面、来源 ID，以及可安全展示的来源清单（source manifest）元数据。常规问答使用 evidence 返回的已整理 `wiki/` 摘录，不读取 `raw/` 原始资料正文。

证据项被截断时，它的 `range` 会包含 `contentLength`、`returnedChars` 和 `truncated`，`continuationCues` 会给出带 `--offset` 和 `--limit` 的受控 `okfh read` 命令。`search` 和 `read` 是更底层的工具，用于调试检索、查看候选文档，或执行一次受控续读。

### read

按概念 ID、路径、`index` 或 `log` 读取 Wiki 文档，输出长度受控。

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

内容被截断时，JSON 响应会告知智能体如何继续。

### graph

构建反向链接数据和自包含的本地 HTML 图谱报告。

```bash
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --open --json
```

报告写入 `.okfh/reports/graph.html`。图谱不会上传任何数据。

`--open` 会请求操作系统用默认浏览器或 HTML 处理程序打开报告。如果 Linux 环境没有图形界面（GUI）或 opener 命令，OKF Harness 仍会写入报告，并返回清楚的错误，提示你手动打开 HTML 文件。

## 退出行为

成功的命令返回退出码 `0`。验证失败、工作区问题或来源命令失败会返回非零退出码，带 `--json` 时 JSON 中包含 `ok: false`。对于 `check`，`ready` 和 `needs_attention` 退出 `0`；`blocked` 退出非 `0`。

## 从源码安装（开发者）

用于仓库开发：

```bash
pnpm install
pnpm build
node packages/cli/dist/main.js doctor --json
```
