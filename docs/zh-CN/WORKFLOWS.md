# OKF Harness 工作流

OKF Harness 是为通过受支持智能体操作的人设计的。CLI 仍然可见，但日常工作从智能体（Agent）开始。

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

在本地终端运行一次 setup：

```bash
curl -fsSL https://okf-harness.dev/install.sh | sh
```

Windows PowerShell：

```powershell
irm https://okf-harness.dev/install.ps1 | iex
```

已经有 Node.js 22 或更高版本？

```bash
npx @okf-harness/setup@latest
```

普通使用需要 macOS、Windows 或 Linux、Node.js 22 或更高版本、由 setup 检查的工作区恢复依赖、首次使用每个固定运行时版本时可访问 npm，以及一个受支持的原生智能体集成。`pnpm` 只用于仓库开发。

“本地优先”描述的是工作区文件存放在本机，不表示保证可在完全隔离网络（air-gapped）的环境中运行。

## 从你的智能体开始

使用当前智能体的 OKF Harness 入口名。Codex 通常使用 `$okf-harness`，Claude Code 通常使用 `/okf-harness`，其他原生集成会通过自己的 skill 或 plugin UI 暴露 `okf-harness`。

创建工作区前和进入工作区后都使用同一个前缀：

```text
<okf-harness> 在我的 Documents 文件夹中为我的 AI 研究笔记设置一个工作区。
```

入口会先调用启动器。没有解析到工作区时，它会从浅层本地工作区集合中发现工作区，或在推断显示名称、目标目录和当前智能体后创建工作区。解析到工作区时，它会直接路由到检查、ingest、对账、回答、图谱或修复。缺少运行时固定版本时，它会执行启动器返回的准确 adopt 命令并重试；无需全局 `okfh`。

Claude Code 和 Codex 的工作区本地适配器保持可用，并可在同名入口下补充工作区指引。其他原生集成继续通过宿主入口完成日常工作；该技能不会声称已经为它们安装工作区本地适配器。

要端到端检查首次启动，可以按这五步操作：

1. 在干净环境中运行 setup。
2. 打开一个受支持智能体。
3. 确认当前智能体能发现 `okf-harness`。
4. 用它创建一个空工作区。
5. 进入该工作区后，用同一个前缀运行检查。

为便于阅读，下面的命令块展示委托后运行时一侧的 `okfh` 形式。宿主技能不会在 `PATH` 中查找该命令，而是通过 `npx @okf-harness/setup@latest launch` 传递相同参数。

## 添加资料

```text
<okf-harness> 将 ~/Downloads/llm-wiki-note.md 添加到这个工作区，更新 Wiki 并加上引用，然后再次检查工作区。
```

智能体应调用：

```bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
```

然后智能体读取已注册的原始资料，编写或更新参考页面和主题页面，更新索引，运行 check，并用 `okfh checkpoint --judgment "<本次周期为何完成>"` 记录这次完成的周期。

原始资料不应在原位编辑。如果资料需要修正，注册一份新的来源。

### 首个有效闭环

首个有效闭环从本地资料开始。先注册一份本地文件，让智能体基于已注册来源整理 Wiki 页面，运行 `okfh check --workspace <workspace> --json`，然后做 first-answer check：这份来源主要讲什么、关键结论是什么、证据来自哪里。

URL 来源只作为来源指针保存。OKF Harness 会记录 URL，但不会自动抓取网页内容。

`okfh status` 和 `okfh check` 可以在 JSON 的 `next` 中返回工作区下一步，人类可读输出也可以把它显示为 `Next: ...`。把这行当作这个闭环里给智能体的下一条提示：添加一份本地来源文件、把网页内容保存成本地文件而不是只依赖 URL 指针、带引用更新 Wiki、处理 check 发现的问题，或执行 first-answer check。CLI 只报告下一步；它不会抓取网页、自动修复问题、给内容质量打语义分，或替你整理 Wiki 页面。

## 对账来源修订

```text
<okf-harness> 将修订后的研究笔记与这个工作区对账，更新所有受影响的 Wiki 论述，并核验工作区的对账封印。
```

当后来登记的本地来源与先前登记文件的原始文件名相同、内容不同时，OKF Harness 会把它识别为疑似来源修订。如果修订后的本地文件尚未登记，智能体先调用：

```bash
okfh source add <revised-path> --workspace <workspace> --json
```

如果 `check` 已发现登记过的疑似修订，则跳过这次登记。无论哪种情况，智能体都用以下命令确定准确的先前版本和修订版本记录：

```bash
okfh source list --workspace <workspace> --json
okfh check --workspace <workspace> --json
```

智能体根据返回的来源 ID 和记录路径，读取两份不可变的已登记副本，并检查由它们提升或受它们影响的参考、概念和索引文件。然后，智能体编辑所有受影响的 Wiki 论述，使其反映修订内容。对账意味着 Wiki 已反映修订内容；仅检查两个版本不算完成对账。CLI 只报告修订，不会自动修复 Wiki。

更新 Wiki 后，智能体先校验编辑结果，再为这组准确的先前版本和修订版本记录判断，最后再次检查对账封印：

```bash
okfh check --workspace <workspace> --json
okfh source reconcile <prior-source-id> <revision-source-id> --note "<Wiki 中更新了哪些内容>" --workspace <workspace> --json
okfh check --workspace <workspace> --json
```

第一个来源 ID 必须是先前版本，第二个必须是它的修订版本。最后一次 `check` 会核验这组版本已不再悬置；只有没有其他已提升来源的悬置对账且没有校验错误时，`data.currency.sealed` 才为 `true`。不要手动编辑 `raw/sources/` 下的已登记文件或 Harness 管理的对账状态。Wiki 反映修订内容之后，智能体用 `okfh checkpoint` 完成本次周期。

## 撤销一次错误改动

```text
<okf-harness> 我们最近改了什么？能把定价那次重写撤掉吗？
```

智能体应调用：

```bash
okfh history --workspace <workspace> --json
okfh restore <completion-id> --workspace <workspace> --json
```

`history` 按从新到旧列出工作区的完成记录，每条包含一个不透明的完成标识，以及该周期完成时记录的判断。智能体读这些判断来确定你指的是哪一次完成，然后回退到那里；你只需用自然语言描述那次改动，不需要自己挑选标识。

restore 可以回到任意一条完成记录，而不只是最新一条，因此几个周期之后才发现的问题仍然可以恢复。回退过程中经过的完成记录仍会列在 history 中，所以工作区可以来回移动。当工作区还有尚未纳入任何完成记录的改动时，restore 会拒绝执行：先完成或丢弃这些改动。

工作区没有 `wiki/log.md`。工作区历史由工作区自身计算得出，因此既不会与 Wiki 争夺你的注意力，也不会被当作证据引用。

## 提问

```text
<okf-harness> 我的工作区里是如何描述 LLM Wiki 结构的？
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

当证据摘要证明 Wiki 中没有任何内容匹配你的问题时，智能体会结合对话把答案推导出来，并可以在“Wiki 没有相关证据”这句话后面追加一句：要保留这个答案吗？回答“要”，就写入一个普通概念页面及其索引链接；不回答则既不写入也不保留任何状态，下次再问同一个问题时这个提议会重新出现。该提议只在确实存在覆盖缺口时出现，因此结果被封存或摘要仅仅被截断时都不会触发。

## 维护工作区

```text
<okf-harness> 检查这个工作区，并告诉我它是否已经就绪。
```

智能体应调用：

```bash
okfh check --workspace <workspace> --json
```

`check` 会报告 `ready`、`needs_attention` 或 `blocked`。它会区分 OKF 合规和 Harness lint，所以断链或缺少索引条目不会被说成 OKF 规范失败。每次编辑 Wiki 后，智能体应再次运行 check 并展示变更的文件。

## 生成图谱

```text
<okf-harness> 为这个工作区生成本地图谱报告，并告诉我 HTML 文件在哪里。
```

智能体应调用：

```bash
okfh graph --workspace <workspace> --json
```

仅在你希望操作系统用默认浏览器打开 HTML 报告时使用 `--open`。如果 Linux 环境没有图形界面（GUI）或 opener 命令，手动打开生成的 HTML 文件即可。

## 修复智能体支持

如果工作区已存在，但当前智能体没有发现 OKF Harness 指引，通过同一个入口告诉它：

```text
<okf-harness> 修复这个工作区的 OKF Harness 支持。
```

有工作区本地适配器时，智能体应修复当前适配器：

```bash
okfh agent install codex --workspace <workspace> --json
okfh agent install claude --workspace <workspace> --json
```

使用与当前工作区适配器匹配的命令。只有在你明确要求同时准备两个工作区适配器时，才使用 `all`。仅在检查冲突后使用 `--force`。对于没有工作区适配器的原生集成，使用 setup 或该宿主集成自己的修复流程。

## 排查入口

如果 `okf-harness` 入口缺失、版本漂移，或被同名非受管理内容阻挡，运行：

```bash
npx --yes --package @okf-harness/cli@latest okfh doctor --json
```

`doctor` 会分别报告运行时、原生集成、宿主入口和工作区检查。`okfh bootstrap status|repair --agents codex|claude|all --json` 是高级 Claude Code 和 Codex fallback 修复工具，不是主要设置流程。

## 文件结构

```text
raw/inbox/        临时存放未注册材料的地方
raw/sources/      已注册的原始资料，视为不可变
wiki/             整理后的 OKF Markdown 概念文档
.okfh/manifest    来源登记表，含哈希和来源 ID
.okfh/reports/    生成的报告，如图谱 graph.html
AGENTS.md         安装 Codex 适配器时的工作区指引
CLAUDE.md         安装 Claude Code 适配器时的工作区指引
```

## 设计克制

OKF Harness 保持本地化、可检查，并且可以通过普通终端命令调试。智能体回答来自已整理的 `wiki/` 证据摘要，必要时再做受控续读；图形界面（GUI）、云端同步、来源连接器、向量检索和 Obsidian 辅助等更宽的产品面，会留在路线图中，直到它们能保留这些保证。
