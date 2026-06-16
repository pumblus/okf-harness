# OKF Harness 开发文档

> Agent-first 的 macOS 本地知识库 Harness。
>
> 版本：v0.1-draft | 2026-06-15 | macOS only | Apache-2.0

## 1. 项目概述

OKF Harness 是一个开源的、本地优先的 OKF / LLM-Wiki Harness。它不是又一个完整知识库应用，也不是 Obsidian 插件。它的目标很窄：让用户在 Claude Code、Codex 等 Agent 里用自然语言完成初始化、文件整理、source ingest、wiki 查询、lint 和维护。CLI 只作为 Agent 的工具层和可调试后门，普通用户不需要记命令。

核心设计判断：**Agent 是主要交互界面，OKF markdown bundle 是数据契约，`okfh` CLI 是隐藏的 deterministic harness。Agent client 默认通过 macOS terminal-native tool channel 调用本地 shell 命令，不要求用户学习 CLI 语言。**

### 1.1 命名与标识

| 项 | 值 |
|---|---|
| 公开项目名 | OKF Harness |
| GitHub 仓库 | `okf-harness` |
| CLI binary | `okfh`（长别名 `okf-harness`，文档统一用 `okfh`） |
| NPM scope | `@okf-harness/*` |
| License | Apache-2.0 |

NPM 包划分：

```
@okf-harness/core       # OKF 解析、校验、manifest、索引、路径安全
@okf-harness/cli        # okfh 命令行
@okf-harness/agent-pack # Claude / Codex adapter 生成器与共享 skill 模板
@okf-harness/mac        # macOS only 辅助工具，v0.2+ 可选
@okf-harness/mcp        # future optional MCP integration, not v0.1 default
```

### 1.2 定位

> A macOS-first, agent-first harness for maintaining OKF-compatible local LLM Wikis from Claude Code, Codex, and future coding agents.

GitHub topics：`okf`, `open-knowledge-format`, `llm-wiki`, `agent-skills`, `claude-code`, `codex`, `macos`, `knowledge-management`

### 1.3 Agent 适配优先级

**Tier 1（v0.1 必须）**：Claude Code、Codex

**Tier 2（Roadmap，v0.2）**：Pi、OpenCode

**Tier 3（仅保留扩展点）**：Cursor、GitHub Copilot coding agent、Aider、Goose、Continue、Zed、VS Code generic MCP clients 等

### 1.4 Obsidian 策略

v0.1 不实现 Obsidian 集成，不依赖 Obsidian vault API，不生成 Obsidian-only metadata。Roadmap 中可以出现。

v0.1 允许"Obsidian-friendly markdown"——普通 markdown links、frontmatter、目录结构尽量兼容，但所有能力脱离 Obsidian 必须可用。

---

## 2. 产品范围

### 2.1 v0.1 要做的事

让用户在 Claude Code 或 Codex 中说自然语言就能完成：

- 初始化知识库 workspace
- 添加 PDF / markdown / 网页链接作为 source
- 生成 ingest plan，由 Agent 编译 source 到 wiki
- 按主题查询知识库
- 运行 lint 检查坏链接、缺 citation、过期页面
- 生成本地 graph HTML

初始化阶段 Agent 自动完成的行为：

1. 选择默认 workspace 路径
2. 创建目录结构
3. 初始化 git
4. 生成 OKF wiki root
5. 生成 raw inbox / source 目录
6. 生成 manifest
7. 生成 CLAUDE.md / AGENTS.md
8. 生成 Claude + Codex skills
9. 运行 lint 和 doctor
10. 告知用户下一步怎么用自然语言添加资料

### 2.2 v0.1 不做的事

不做 Obsidian plugin、不做 GUI、不做云同步、不做账号系统、不做团队权限、不做向量数据库、不做 background daemon、不做 Windows / Linux 支持、不做自动网页爬虫、不做自动 silent rewrite 大量 wiki 页面、不做私有 agent runtime。

### 2.3 MVP 验收标准

1. 新 macOS workspace 可由 Agent 初始化，lint pass
2. Claude Code 项目中自动发现 OKF skills
3. Codex 项目中自动发现 OKF skills
4. Claude Code 和 Codex 都能通过 skills / guidance 调用 `okfh --json`
5. 添加本地 markdown / text / PDF 时，source 被复制登记，hash 被记录，raw source 不被修改
6. ingest plan 给 Agent 一份可执行的 wiki 更新计划
7. lint 检测 OKF 必须项、坏链接、log 日期、source hash drift
8. graph 输出单文件 HTML
9. Obsidian 没有 runtime 依赖

---

## 3. 架构概览

### 3.1 三层操作模型

本项目实现 Karpathy LLM Wiki 的三层结构：

```
raw sources  # 用户收集的原始材料，source of truth，默认不可变
wiki         # Agent 维护的 markdown knowledge bundle
schema       # Agent 指令、工作流、约束文件（CLAUDE.md / AGENTS.md / skills）
```

四种核心操作：

```
ingest  # Agent 读取 source，生成 reference page，更新 topic / entity / project pages，更新 index / log
query   # Agent 先读 wiki/index.md，再搜索和读取 concept pages，再回答
lint    # deterministic tool 检查 OKF 合规性、坏链接、缺 citation、source hash、孤儿页面等
graph   # 生成 backlinks 和可视化
```

v0.1 的核心是"ingest-time synthesis + markdown wiki + deterministic harness"，不做 RAG / embedding。

### 3.2 内部模块边界

```
@okf-harness/core       无 CLI、Agent、MCP 依赖
@okf-harness/agent-pack 无 core/CLI/MCP 依赖，负责纯 adapter 渲染与安装计划
@okf-harness/cli        连接 core 和 agent-pack，提供 terminal-native tool channel
@okf-harness/mcp        future optional integration，包装 core 导出 tools，不属于 v0.1 默认路径
```

### 3.3 技术栈

| 层 | 选型 |
|---|---|
| Runtime | Node.js 22+ on macOS（v0.1 不要求 Bun） |
| 包管理 | pnpm |
| 语言 | TypeScript，ESM |
| 构建 | tsup 或 tsdown |
| 测试 | Vitest |
| CLI | commander + zod |
| Markdown / frontmatter | gray-matter + yaml + unified / remark |
| 搜索（MVP） | markdown / frontmatter scan + 可选 ripgrep |
| 搜索（v0.2+） | SQLite FTS5 cache（better-sqlite3），.okfh/cache/index.sqlite 完全可重建 |
| Tool channel | Agent client 默认通过本地 shell 调用 `okfh --json`；MCP 仅保留为 future optional integration |

模板渲染依赖边界：优先使用 TypeScript 纯函数生成小规模文本模板，配合 golden fixtures 保证输出稳定。只有当生成文件数量、条件分支、复用片段、多语言需求、非工程人员直接编辑需求，或 fixture diff review 成本中至少两项明显成立时，才引入 Handlebars / EJS 等模板依赖。不得因为"看起来更专业"而增加模板运行时。

---

## 4. 工作空间

### 4.1 目录结构

`okfh init` 生成以下结构：

```
<workspace>/
  README.md
  AGENTS.md
  CLAUDE.md
  okfh.config.yaml
  .codex/
    .gitkeep
  .claude/
    skills/
      okf-harness-init/SKILL.md + references/workflow.md
      okf-harness-ingest/SKILL.md + references/ingest-contract.md
      okf-harness-query/SKILL.md + references/answer-contract.md
      okf-harness-maintain/SKILL.md + references/lint-contract.md
  .agents/
    skills/
      okf-harness-init/SKILL.md + references/workflow.md
      okf-harness-ingest/SKILL.md + references/ingest-contract.md
      okf-harness-query/SKILL.md + references/answer-contract.md
      okf-harness-maintain/SKILL.md + references/lint-contract.md
  raw/
    inbox/README.md
    sources/README.md
    assets/README.md
  wiki/
    index.md
    log.md
    references/index.md
    topics/index.md
    entities/index.md
    projects/index.md
    decisions/index.md
    questions/index.md
  .okfh/
    manifest.jsonl
    backlinks.json
    reports/
    cache/.gitkeep
  .gitignore
```

### 4.2 默认路径

- workspace 默认路径：`~/Documents/OKF Harness/<workspace-slug>/`
- 应用状态路径：`~/Library/Application Support/OKF Harness/`
- workspace 内 `.okfh/` 是知识库的可重建 / 半可重建状态，不是全局应用状态

### 4.3 okfh.config.yaml

```yaml
version: 0.1
workspace:
  name: AI Research
  created_at: 2026-06-15T12:00:00-07:00
  platform: macos
okf:
  bundle_root: wiki
  profile: okf-harness-default
agents:
  tier1:
    claude: true
    codex: true
  tier2:
    pi: false
    opencode: false
paths:
  raw_inbox: raw/inbox
  raw_sources: raw/sources
  wiki_root: wiki
  manifest: .okfh/manifest.jsonl
safety:
  raw_sources_immutable: true
  require_git_checkpoint_before_agent_write: true
  max_files_changed_per_ingest: 20
```

### 4.4 .gitignore

```gitignore
# OKF Harness generated caches
.okfh/cache/
.okfh/*.sqlite
.okfh/backlinks.json
.okfh/reports/graph.html
.okfh/reports/*.tmp

# OS
.DS_Store

# Secrets
.env
.env.*
!.env.example
```

`raw/sources/` 默认纳入 git，因为 raw sources 是知识库 source of truth。未来可在 `okfh.config.yaml` 中关闭 source tracking。

---

## 5. OKF 数据格式

OKF 是本项目的数据契约。v0.1 的 OKF bundle 是一个 markdown 文件目录，放在 workspace 的 `wiki/` 目录中。

### 5.1 必需约束

`wiki/` 下所有非保留 `.md` 文件必须有 YAML frontmatter，且必须有非空 `type` 字段。`index.md` 和 `log.md` 是保留文件名，不作为普通 concept document 使用。

```yaml
---
type: Topic
title: Example Topic
description: One-line description.
tags: [example]
timestamp: 2026-06-15T12:00:00-07:00
---
```

### 5.2 Harness profile（soft 约束）

OKF 本身最小化。本项目定义一个 soft profile，用于 lint、Agent 工作流和 UI 预期。消费者不能因为缺失 soft 字段就拒绝 OKF bundle；只有 OKF 必需项是 hard error。

**推荐 concept types**：

```
Reference     # 一份 source 的 mirror / summary
Topic         # 抽象概念或主题
Entity        # 人、组织、产品、系统
Project       # 进行中的项目
Decision      # 明确的决策记录
Question      # 未解决的问题或研究课题
GlossaryTerm  # 定义页
IndexNote     # 可选的非标准生成摘要，尽量少用
```

**Harness 自有 namespace**：OKF 允许 producer-defined frontmatter keys。OKF Harness 使用 `okfh:` namespace 保存工具自己的 metadata：

```yaml
okfh:
  status: active
  confidence: medium
  sources:
    - src_20260615_0001
  updated_by: agent
```

**Reference page 示例**：

```yaml
---
type: Reference
title: Karpathy LLM Wiki gist
description: Source note for the LLM Wiki pattern gist.
resource: raw/sources/2026/06/karpathy-llm-wiki.md
tags: [llm-wiki, source]
timestamp: 2026-06-15T12:00:00-07:00
okfh:
  source_id: src_20260615_0001
  source_sha256: <sha256>
  status: active
---
```

### 5.3 Body 结构建议

Reference pages 推荐以下 sections：

```markdown
# Summary
# Key claims
# Useful quotes or snippets
# Affected concepts
# Open questions
# Citations
```

Topic / Entity pages：

```markdown
# Overview
# Current synthesis
# Supporting evidence
# Tensions and contradictions
# Related concepts
# Open questions
# Citations
```

Decision pages：

```markdown
# Decision
# Context
# Options considered
# Consequences
# Review date
# Citations
```

### 5.4 链接与 Citation

链接优先使用 bundle-root absolute markdown links。这里的 bundle root 是生成后的 OKF workspace/wiki 根路径，不是本仓库的 `docs/` 根路径：

```text
Markdown example shape: link text "LLM Wiki" with URL path "/topics/llm-wiki.md".
```

正文中来自外部 source 的事实性 claim，在页面底部 `# Citations` 中列出 source。内部 source mirror 可指向 `/references/...`。

---

## 6. CLI 参考

### 6.1 通用规则

所有命令都支持以下 flag：

- `--json`：machine-readable 输出
- `--dry-run`：不写文件，返回计划写入的内容
- `--workspace`：指定 workspace 路径。只读 / 维护命令可以在未提供时从当前目录向上查找最近 `okfh.config.yaml`；会改变 evidence 或 workspace 状态的命令默认要求显式指定 workspace，除非该命令文档另有说明。
- `--quiet`：抑制非错误的人类可读文本

退出码：

```
0  成功
1  validation / lint 失败
2  用法错误
3  文件系统安全拒绝
4  缺少依赖
5  runtime 错误
```

JSON 输出封套：

```json
{
  "ok": true,
  "command": "source add",
  "workspace": "/Users/me/Documents/OKF Harness/ai-research",
  "data": {},
  "warnings": [],
  "next": ["Ask your agent: ingest the newest source into the OKF wiki."]
}
```

所有 `--json` command 都必须使用同一顶层封套：`ok`、`command`、`workspace`、`data`、`warnings`、`next`。命令专属结构只放在 `data` 里，例如 `data.results`、`data.target`、`data.graph`，避免 Agent 为不同命令猜不同返回形状。

失败的 `--json` command 也必须使用同一封套，并额外返回 `error`：

```json
{
  "ok": false,
  "command": "read",
  "workspace": "/Users/me/Documents/OKF Harness/ai-research",
  "data": {},
  "warnings": [],
  "error": {
    "code": "TARGET_NOT_FOUND",
    "message": "No OKF concept document matched the read target.",
    "details": {}
  },
  "next": ["Run okfh search with broader keywords, then read one of the returned concept paths."]
}
```

`workspace` 在无法解析 workspace 时可以是 `null`，但只要 workspace 已解析就必须返回 resolved path。错误信息面向用户和 Agent，不输出 stack trace。

非 `--json` 输出只做最小可读，不作为稳定机器契约。search 打印排名、标题、path、type；read 打印标题、path、截断提示和返回内容；graph 打印 report 路径和可选打开提示；失败时打印一句人话和下一步。不要实现 TUI、分页器、富表格或额外交互。

### 6.2 核心命令

**okfh init**

```bash
okfh init ~/Documents/OKF\ Harness/ai-research \
  --name "AI Research" \
  --agents claude,codex \
  --git \
  --json
```

行为：创建 workspace tree、写 config、写 OKF root index / log、写 Claude / Codex adapters、按需 git init、运行 lint、返回下一步自然语言指令。

**okfh status**

```bash
okfh status --workspace <workspace> --json
```

Phase 5 起，`status` 可省略 `--workspace` 并向上查找最近 `okfh.config.yaml`。JSON `data` 必须包含 `capabilities` 摘要，至少包括：

```json
{
  "search": "available",
  "read": "available",
  "graph": "available",
  "queryCommand": "not_available"
}
```

`queryCommand: "not_available"` 表示 v0.1 没有 `okfh query` 或 LLM answer command，Agent 应使用 `search` + `read` workflow。

**okfh source add**

```bash
okfh source add ~/Downloads/paper.pdf --workspace <workspace> --json
okfh source add https://example.com/article --workspace <workspace> --json
```

行为：
1. 解析并校验路径
2. Phase 4 只接受普通文件和 URL；目录输入返回清晰错误，不实现 `--recursive`
3. 复制文件到 `raw/sources/YYYY/MM/<safe-slug>.<ext>`，不修改原文件
4. 计算 sha256
5. 追加 manifest 行
6. 返回 source id 和建议的自然语言下一步

重复处理：

- 相同内容的本地文件已登记时，返回已有 source，视为成功
- 同名但内容不同的本地文件自动使用 `-2`、`-3` 等后缀保存为新 source
- 相同 URL 已登记时，返回已有 source，视为成功

安全与 dry-run：

- `--dry-run` 可以读取 source、计算 hash、判断重复、返回计划，但不写 `raw/sources/` 或 manifest
- 如果 raw source copy 成功但 manifest 写入失败，删除刚复制的 raw source，避免留下半成品
- Manifest 默认不保存本机绝对路径；本地文件 provenance 只保存非敏感来源标签

URL 来源的行为：将 URL metadata 存储为 `raw/sources/YYYY/MM/<slug>.url.md`，不承诺完整网页抓取，不自动读取网页标题，由 Agent 自行决定是否用网络 / 浏览器工具获取内容。URL source 是来源指针，不是网页内容快照；如果需要保留网页某个版本，应先由 Agent 保存网页内容，再作为文件 source 登记。Manifest kind=url。

**okfh source list**

```bash
okfh source list --workspace <workspace> --json
```

**okfh ingest plan**

```bash
okfh ingest plan src_20260615_0001 --workspace <workspace> --json
```

返回 candidate concepts、建议的 reference path 和 checklist。Phase 4 的 ingest plan 不读取 source 正文、不生成 summary、不提取 claims、不做语义分析、不自行合成 wiki body。所有语义分析都交由 Agent 在后续 ingest workflow 中完成；Harness 只提供 deterministic metadata-level plan。

**okfh search**

```bash
okfh search "LLM Wiki contradictions" --json
```

MVP 搜索顺序：解析 wiki/index.md → rg 或 JS fallback 搜索 markdown / frontmatter → 可选 SQLite FTS cache → 按 title / type / tag / path / body hit count 排序。

**okfh read**

```bash
okfh read <concept-id> --json
```

**okfh lint**

```bash
okfh lint --workspace <workspace> --json
```

Hard errors：

```
OKF_MISSING_FRONTMATTER
OKF_INVALID_FRONTMATTER
OKF_MISSING_TYPE
RESERVED_FILE_HAS_CONCEPT_FRONTMATTER
LOG_INVALID_DATE_HEADING
SOURCE_HASH_DRIFT
CONFIG_INVALID
```

Warnings：

```
BROKEN_LINK
MISSING_INDEX_ENTRY
MISSING_CITATIONS_SECTION
ORPHAN_CONCEPT
REFERENCE_WITHOUT_SOURCE_ID
STALE_TIMESTAMP
LARGE_UNSUMMARIZED_SOURCE
```

**okfh graph**

```bash
okfh graph --json
```

输出 `.okfh/backlinks.json` 和 `.okfh/reports/graph.html`。

**okfh agent install**

```bash
okfh agent install claude|codex|all --json
```

行为：使用 `@okf-harness/agent-pack` 渲染或修复 Claude Code / Codex adapters。支持 `--dry-run` 返回文件计划而不写入；支持显式 `--force` 覆盖 adapter 目标文件，但不得覆盖 root guidance managed block 外的用户内容，也不得触碰 `wiki/` 或 `raw/`。

JSON `data` 至少包含：

```json
{
  "adapter": "all",
  "dryRun": false,
  "writtenFiles": [],
  "plannedFiles": [],
  "replacedFiles": [],
  "skippedFiles": [],
  "conflicts": [],
  "managedBlocks": []
}
```

**okfh doctor**

```bash
okfh doctor --json
```

行为：检查当前 `okfh` CLI entrypoint、Node.js 22+、git、pnpm，并在可解析 workspace 时检查 workspace 初始化 / lint 摘要和 Claude / Codex adapter 文件状态。`doctor` 不写文件，不修复 workspace；只返回诊断和下一步。

JSON `data` 至少包含：

```json
{
  "checks": [
    {
      "id": "workspace-status",
      "label": "Workspace status",
      "status": "pass",
      "message": "Workspace AI Research is initialized and lint passes.",
      "details": {}
    }
  ],
  "summary": { "pass": 7, "warn": 0, "fail": 0, "skip": 0 }
}
```

`status` 只使用 `pass`、`warn`、`fail`、`skip`。只有 `fail` 使 `ok:false` 和退出码 1；未提供 workspace 且当前目录无法向上找到 `okfh.config.yaml` 时返回 warning / skip，不阻塞用户诊断 CLI 环境。

### 6.3 命令安全规则

每个读命令必须有 `--json`；每个写文件命令必须支持 `--dry-run`；每个可能覆盖文件的命令必须先生成 diff 或显式返回 pending action。

---

## 7. Tool Channel

### 7.1 默认通道

v0.1 默认使用 terminal-native tool channel：Agent client 通过本地 shell 调用 `okfh --json`、`git` 和必要的文件系统命令。普通用户仍然用自然语言和 Agent 交互，不需要学习 CLI 语言。

默认通道的约束：

- Agent guidance 必须优先教 Agent 调用 `okfh --json`
- Agent 不应手写替代目录结构来绕过 `okfh init`
- 写文件命令必须支持 `--dry-run` 或 pending action
- 修改 wiki 后必须运行 `okfh lint --workspace <workspace> --json`
- 修改文件后必须运行 `git diff`

### 7.2 Future optional MCP integration

MCP 不属于 v0.1 默认产品路径，也不阻塞 v0.1 发布。未来如果需要支持只能稳定发现 MCP tools 的 agent client，可以在保持 terminal-native workflow 的前提下提供 optional MCP integration。

未来 MCP 约束：

- 不暴露任意 `write_file`
- 不存储 API keys 或任意环境变量
- 只包装 core / CLI 已有的确定性行为
- write-capable tools 必须 dry-run friendly

可选 MCP tools 的大输出应写入 report file 并返回路径：

```json
{
  "summary": "32 concepts, 4 warnings",
  "reportPath": ".okfh/reports/lint-20260615-120000.json"
}
```

---

## 8. Agent 适配器

### 8.1 共享 Skill 模板

不维护两份独立 skill 副本。当前实现以 TypeScript 字符串函数维护共享 skill 模板；只有当全局模板依赖边界被触发时，才引入 Handlebars / EJS 等模板依赖。生成的 adapter 文件形态为：

```
<adapter skill root>/
  okf-harness-init/SKILL.md + references/workflow.md
  okf-harness-ingest/SKILL.md + references/ingest-contract.md
  okf-harness-query/SKILL.md + references/answer-contract.md
  okf-harness-maintain/SKILL.md + references/lint-contract.md
```

`okfh agent install claude` 渲染到 `.claude/skills/`，`okfh agent install codex` 渲染到 `.agents/skills/`。产品差异通过 adapter renderer 注入少量 invocation wording，不靠手动分叉。

Agent guidance 使用 layered agent guidance：root `CLAUDE.md` / `AGENTS.md` 只放短规则和 skill 路由；`SKILL.md` 放核心流程、hard rules、停止条件和输出要求；`references/*.md` 放详细模板、契约和示例。避免把长流程塞进 root guidance，也避免让每个 skill 一次性加载所有细节。

Root guidance 文件使用 harness-managed guidance block。OKF Harness 只插入或替换自己 marker 包围的区块，保留 block 外用户内容。Phase 2 placeholder 可以被安全替换；非 placeholder 的用户内容不能被静默覆盖。生成的用户 workspace 要按真实 Claude Code / Codex 多 agent 场景设计，不能把本开发仓库的维护者习惯假定为用户习惯。

### 8.2 Skill 规范

所有 skill 名满足：小写字母 + 数字 + 连字符，不以下划线 / 空格 / 大写开头，不超过 64 字符，与 skill 目录名一致。所有 skill 描述必须包含"何时使用"和"何时不要使用"，因为 Codex 和 Claude 都靠 description 做自动触发。

Phase 3 不预批准宽泛工具权限。生成的 skills 默认允许模型按 description 自动触发，但不写入 Claude `allowed-tools`，不设置 `disable-model-invocation: true`，也不生成 Codex plugin / MCP 配置。安全边界由 `okfh --json`、dry-run / pending action、raw source immutability、lint 和 git diff 共同承担。

OKF Harness 生成的 `SKILL.md` 必须带 `metadata.okf-harness-managed: true`，用于区分 harness-managed adapter 文件和用户自定义同名 skill。安装时只有 harness-managed 文件或 Phase 2 placeholder 可以默认更新；同名目录存在但不带 managed metadata 时必须返回 conflict，除非用户显式 `--force`。

Skill 生成模板：

```markdown
---
name: okf-harness-ingest
description: Add source material and compile it into an OKF-compatible LLM Wiki by creating reference pages, updating topic/entity/project pages, citations, index, and log. Use when the user asks to add, ingest, absorb, summarize into the wiki, or organize a new source. Do not use for general question answering without new sources.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex on macOS. Requires the okfh CLI and local shell command access.
metadata:
  okf-harness-version: "0.1"
  okf-harness-managed: true
---

# OKF Harness Ingest

Use this skill to register source material and compile it into the local OKF wiki.

## Required behavior

1. Locate the workspace by finding `okfh.config.yaml`.
2. Use the local shell to run `okfh --json` commands.
3. If the source is not registered, run `okfh source add <path-or-url> --workspace <workspace> --json`.
4. Run `okfh ingest plan <source-id-or-path> --workspace <workspace> --json`.
5. Read the full source if available and safe.
6. Create or update exactly one `wiki/references/<slug>.md` page for the source.
7. Update affected `wiki/topics/`, `wiki/entities/`, `wiki/projects/`, `wiki/decisions/`, or `wiki/questions/` pages.
8. Preserve uncertainty and contradictions. Do not erase unresolved tension just to make a clean narrative.
9. Add or update `# Citations` sections.
10. Update `wiki/index.md` and relevant subdirectory indexes.
11. Append `wiki/log.md`.
12. Run `okfh lint --workspace <workspace> --json`.
13. Show the user changed files, lint status, and unresolved questions.

## Hard rules

- Never edit `raw/sources/`.
- Never invent source IDs, citations, dates, or claims.
- Prefer small patches.
- If more than 20 wiki files seem affected, stop after an ingest plan and ask the user to narrow scope.
- Run `git diff` before final response when file changes were made.

See `references/ingest-contract.md` inside the generated OKF workspace for exact page templates.
```

### 8.3 Skill 清单

**okf-harness-init**：初始化 workspace、第一次设置、文件组织、Agent 支持安装。

```yaml
description: Initialize and organize an OKF Harness workspace on macOS, including folders, git, OKF bundle files, and Claude/Codex adapters. Use when the user asks to set up, create, initialize, organize, or install OKF Harness support. Do not use for ingesting an already-added source.
```

**okf-harness-ingest**：添加 source、生成 ingest plan、编译 source 到 wiki。

```yaml
description: Add source material and compile it into an OKF-compatible LLM Wiki by creating reference pages, updating topic/entity/project pages, citations, index, and log. Use when the user asks to add, ingest, absorb, summarize into the wiki, or organize a new source. Do not use for general question answering without new sources.
```

**okf-harness-query**：查询知识库。

```yaml
description: Answer questions using the local OKF Harness wiki by searching concepts, bounded-reading relevant pages, following citations when needed, and citing concept paths plus source IDs when available. Use when the user asks what their knowledge base says, asks a research question, or requests synthesis from existing wiki knowledge. Do not use to ingest new source material.
```

**okf-harness-maintain**：lint、修复、graph、重构。

```yaml
description: Maintain an OKF Harness wiki by running lint, repairing broken links or missing metadata, updating index/log files, checking source hashes, and generating graph reports. Use when the user asks to check, clean up, repair, validate, lint, or visualize the knowledge base. Do not use for first-time initialization.
```

### 8.4 Claude Code 适配

生成文件：

```
CLAUDE.md
.claude/skills/<skill>/SKILL.md
```

`CLAUDE.md` 保持精短，OKF Harness 内容放在 managed block 内：

```markdown
# OKF Harness workspace

<!-- OKF Harness: start -->
This repository is an OKF Harness workspace.

Use the project skills for user-facing workflows:

- `/okf-harness-init` for first-time setup and adapter repair.
- `/okf-harness-ingest` for adding or compiling sources.
- `/okf-harness-query` for answering from the wiki.
- `/okf-harness-maintain` for lint, repair, and graph reports.

Rules:

- `raw/sources/` is immutable. Never edit source files.
- `wiki/` is the OKF bundle and may be edited by the agent.
- Use `okfh --json` through the local shell for deterministic harness operations.
- Run `okfh lint --workspace <workspace> --json` after modifying wiki files.
- Run `git diff` before final response after any file changes.
<!-- OKF Harness: end -->
```

注意事项：v0.1 不生成 `.mcp.json`，不依赖 project hooks，不发 Claude plugin。Agent 应通过本地 shell 调用 `okfh --json`；CLI 不可用时提示用户安装或运行 `okfh doctor`，不要手写替代 workspace 结构。

### 8.5 Codex 适配

生成文件：

```
AGENTS.md
.agents/skills/<skill>/SKILL.md
```

`AGENTS.md` 保持精短，OKF Harness 内容放在 managed block 内：

```markdown
# OKF Harness workspace

<!-- OKF Harness: start -->
This repository is an OKF Harness workspace.

Use repo skills for workflows:

- `$okf-harness-init` for first-time setup and adapter repair.
- `$okf-harness-ingest` for adding or compiling sources.
- `$okf-harness-query` for answering from the wiki.
- `$okf-harness-maintain` for lint, repair, and graph reports.

Rules:

- `raw/sources/` is immutable. Never edit source files.
- `wiki/` is the OKF bundle and may be edited by the agent.
- Use `okfh --json` through the local shell for deterministic harness operations.
- Run `okfh lint --workspace <workspace> --json` after modifying wiki files.
- Run `git diff` before final response after any file changes.
<!-- OKF Harness: end -->
```

注意事项：`AGENTS.md` 必须短小，长流程放 skills。Codex skills 必须有 `name` 和 `description`。v0.1 不依赖 Codex plugins 或 MCP 配置，直接 repo skills + local shell 更简单。

---

## 9. 核心模块

### 9.1 Source 与 Manifest 管理

**Manifest 格式**：`.okfh/manifest.jsonl`，append-friendly JSONL。

```json
{"id":"src_20260615_0001","kind":"file","original":"article.pdf","path":"raw/sources/2026/06/article.pdf","sha256":"...","title":"Article","added_at":"2026-06-15T12:00:00-07:00","status":"registered","reference_concept":"wiki/references/article.md"}
```

字段：

| 字段 | 说明 |
|---|---|
| id | 稳定的 source id |
| kind | Phase 4 支持 file / url；text / clipboard / folder / unknown 是未来扩展 |
| original | 本地文件保存非敏感来源标签；URL 保存完整 URL |
| path | raw/sources 下的本地路径 |
| sha256 | 存储后的 hash |
| mime | 检测到的 MIME |
| title | 人类可读标题 |
| added_at | ISO 时间戳 |
| status | Phase 4 只自动写 registered；planned / ingested / superseded / error 是未来显式状态 |
| reference_concept | wiki reference page 路径（创建后；Phase 4 不自动回写） |
| notes | 可选短文本 |

**Raw immutability**：`raw/sources/` 文件默认不可修改。`okfh lint` 检查 stored sha256 与 manifest 一致，不一致输出 `SOURCE_HASH_DRIFT`。Manifest 指向的 raw source 不存在时输出 `SOURCE_MISSING`。Manifest 坏行输出 `MANIFEST_INVALID`。`raw/sources/` 下没有 manifest 记录的文件输出 `UNREGISTERED_RAW_SOURCE` warning。Reference document 的 `okfh.source_id` 不存在时输出 `REFERENCE_SOURCE_MISSING`。Agent skills 必须明确不编辑 `raw/sources/`；如需修正 source，添加新 source，未来可将旧 source 标记 superseded。

### 9.2 路径安全

实现 `safeResolveWorkspacePath(workspace, input)`：

- 尽量 resolve symlinks
- 拒绝 workspace 外的写入（显式 `source add` 从外部路径读取除外）
- 不跟踪写入 raw/sources 的 symlink
- manifest 和 OKF concept IDs 统一使用 POSIX 风格相对路径

### 9.3 Concept ID

Concept ID 是相对于 OKF bundle root 的路径，去掉 `.md`：

```
wiki/topics/llm-wiki.md → topics/llm-wiki
```

Markdown 链接优先 absolute bundle-relative：

```
/topics/llm-wiki.md
```

### 9.4 Slug 生成

```
小写 → unicode normalize NFKD → 空格替换为连字符 → 去掉不安全文件系统字符 → 合并连字符 → 限制 80 字符 → 冲突时追加 -2, -3...
```

### 9.5 Linter 规则

**Okf hard rules**：

- `wiki/` 下每个非保留 `.md` 有可解析 YAML frontmatter
- 每个非保留 `.md` 有非空 type
- index.md 符合 index 格式
- log.md 日期标题格式为 YYYY-MM-DD

Phase 1 只实现这些 OKF bundle hard rules 和 `CONFIG_INVALID`。依赖 manifest / source hash 的 hard rules（例如 `SOURCE_HASH_DRIFT`）在 Phase 4 source management 中实现。

**Harness rules**：

- raw source hashes 与 manifest 一致
- reference page 的 source_id 存在
- status=ingested 的 manifest source 有 reference page
- concept links 可解析，否则报 warning
- index entries 指向存在的文件

Linter 输出类型：

```ts
type LintSeverity = 'error' | 'warning' | 'info';

type LintIssue = {
  code: string;
  severity: LintSeverity;
  message: string;
  path?: string;
  line?: number;
  fixable?: boolean;
};
```

### 9.6 Graph Builder

从 markdown links 构建 graph：

```json
{
  "nodes": [{"id":"topics/llm-wiki","path":"wiki/topics/llm-wiki.md","type":"Topic","title":"LLM Wiki"}],
  "edges": [{"from":"topics/llm-wiki","to":"topics/okf","kind":"markdown-link"}]
}
```

`graph.html` 必须是自包含的本地文件，不加载远程脚本。

---

## 10. Agent 工作流

### 10.1 Init 流程

Agent 步骤：

1. 确定 workspace 路径
2. 执行 `okfh init --agents claude,codex --git --json`
3. 读取 JSON 结果
4. 执行 `okfh status --workspace <workspace> --json`
5. 用日常语言解释目录结构
6. 建议第一步：把文件放进 raw/inbox，或让 Agent 添加文件 / 链接

Agent final response 必须包含：workspace 路径、已安装的 adapters、CLI / local shell 可用状态、下一步自然语言示例。

### 10.2 Init 策略

```
用户提供路径：使用该路径
用户只提供名字：使用 ~/Documents/OKF Harness/<slug-name>
用户没有提供名字：使用 Personal Knowledge，生成 personal-knowledge slug
目标目录不存在：创建
目标目录存在但非空：不覆盖，先运行 okfh doctor 或建议创建子目录
没有 git repo：运行 git init
用户没有指定 agent：默认安装 Claude + Codex Tier 1
`okfh` 不可用：提示用户安装或运行 `okfh doctor`
```

### 10.3 Ingest 流程

Agent 步骤：

1. 如需要，注册 source
2. 运行 ingest plan
3. 读取 source 和相关 wiki pages
4. 创建 / 更新 reference page
5. 更新受影响的 concept pages
6. 更新 indexes 和 log
7. 运行 lint
8. 展示 changed files 和 unresolved questions

Hard stop 条件：

- Source 无法读取
- Source 看起来敏感且用户未明确要求 ingest
- 超过 20 个 wiki 文件会被修改
- Lint 有与当前编辑无关的 hard OKF errors
- Git working tree 有未提交的不相关改动，用户未授权编辑

### 10.4 Query 流程

Agent 步骤：

1. 读取 wiki/index.md
2. 搜索 concepts
3. 阅读完整 concept 文件，不只是孤立片段
4. 涉及事实精度时，跟踪 citations / reference pages
5. 回答时附带 concept paths 和 source IDs
6. 如果回答揭示有价值的新综合结论，询问是否保存为新的 Question / Topic page；不自动保存

### 10.5 Maintain 流程

Agent 步骤：

1. 执行 `okfh lint --workspace <workspace> --json`
2. 把 issue 分类为安全 auto-fix vs 人工 review
3. 仅自动修复机械性问题：缺失 index entries、格式错误的日期、移动后明显的断链
4. 不重写概念性内容
5. 再次 lint
6. 按要求运行 graph

---

## 11. 开发指南

### 11.1 仓库结构

```
okf-harness/
  README.md
  LICENSE
  SECURITY.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  AGENTS.md
  CLAUDE.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  docs/
    IMPLEMENTATION.md
    ROADMAP.md
    OKF_PROFILE.md
    AGENT_ADAPTERS.md
  packages/
    core/src/
      config/ okf/ manifest/ paths/ lint/ search/ graph/ source/
    core/test/
    cli/src/
      main.ts commands/
    cli/test/
    agent-pack/src/
      index.ts                         # shared templates, renderers, installer
    agent-pack/test/
      golden/
    mcp/                              # future optional integration, not v0.1 default
    mac/src/ test/
  templates/workspace/
  examples/minimal-workspace/ sources/
  scripts/
```

### 11.2 实现阶段

按以下顺序实现，不提前做后面的阶段。

**Phase 0：Repo scaffold**

目标：创建 monorepo、基础工具链、空包、CI。

- [x] package.json + pnpm-workspace.yaml
- [x] TypeScript config
- [x] Vitest config
- [x] ESLint / Prettier 或 Biome
- [x] packages/core, cli, mcp scaffold, agent-pack
- [x] root README skeleton
- [x] LICENSE Apache-2.0
- [x] GitHub Actions: install, typecheck, test

验收：`pnpm install`、`pnpm test`、`pnpm typecheck` 通过，无 runtime 行为。

**Phase 1：Core OKF + config + 路径安全**

- [x] Workspace config schema
- [x] Path resolver
- [x] Frontmatter parser
- [x] Concept scanner
- [x] OKF hard linter（仅 OKF bundle hard rules + CONFIG_INVALID；不含 manifest / source hash 规则）
- [x] Fixture workspace tests

验收：config 解析、OKF concept 扫描、Phase 1 hard OKF linter rules 通过 fixture 测试。

**Phase 2：CLI init / status / lint**

- [x] okfh binary
- [x] init / status / lint 命令
- [x] JSON output envelope
- [x] core workspace template generation（OKF wiki、raw、.okfh、config、thin guidance placeholders）
- [x] git init 可选

边界：Phase 2 只生成可 lint 通过的 core workspace skeleton。Claude / Codex skill 内容的真实渲染归 Phase 3。Phase 2 可以创建 adapter 目录或薄 placeholder，但必须在输出 warning 中标记 agent pack 尚未安装，不能生成会被误认为可用的真实 skill。

验收：CLI 创建符合 Phase 2 边界的 workspace 结构，所有命令支持 `--json`，`init` 后 Phase 1 hard linter pass，e2e 测试通过临时目录完成。

**Phase 3：Agent pack**

- [x] 共享 skill 模板
- [x] Claude renderer / Codex renderer
- [x] CLAUDE.md / AGENTS.md renderer
- [x] `okfh init --agents claude|codex|all|none` 接入 renderer，默认 `all`
- [x] `okfh agent install claude|codex|all --json`
- [x] Agent skill conformance tests
- [x] Explicit golden fixture tests

边界：Phase 3 重点是 Claude Code 和 Codex skills / guidance 符合规范并可发现。`okf-harness-init` 应可完整执行；`okf-harness-ingest`、`okf-harness-query`、`okf-harness-maintain` 可以描述 Phase 4/5 的未来命令，但当 CLI 命令不存在时必须停止并说明能力未实现，不能手写替代 source manifest、search、graph 或 raw source 管理。不得实现 MCP、Pi、OpenCode、Obsidian、source add、ingest plan、search/read 或 graph。

验收：生成的 skills 满足 Agent Skills 命名和 frontmatter 要求；description 包含明确 Use / Do not use 边界；引用的 `references/*.md` 存在；Claude 和 Codex 四个 skill 名一致且核心正文一致；root guidance 含 OKF Harness managed block 且保留 block 外用户内容；explicit golden fixture tests 和 conformance tests 通过。

**Phase 4：Source manifest + source add + ingest plan**

- [x] Manifest JSONL read / write
- [x] sha256 hashing
- [x] source add（file + URL metadata）
- [x] source list
- [x] ingest plan generator（metadata-level candidate concepts + checklist，不读 source 正文）
- [x] raw source immutability lint rule

验收：hash drift、missing source、manifest invalid、reference source missing、unregistered raw source warning、重复文件名、重复内容、重复 URL、dry-run 测试通过。

**Phase 5：Search + read + graph**

- [x] search / read 命令
- [x] 不实现 `okfh query` 或 LLM answer command；query 编排由 Agent skill 使用 search + read 完成，`okfh query plan` 留给 v0.2 bounded evidence pack
- [x] core 保持保守模块边界：新增 `packages/core/src/search`、`packages/core/src/read`、`packages/core/src/graph`；共享 workspace resolution helper 和 markdown link parser；不要提前抽象成统一 query engine
- [x] CLI 只负责参数解析、调用 core、渲染统一 JSON envelope / 最小人类输出；ranking、read target resolution、graph building 等行为留在 core
- [x] search / read / graph 支持显式 `--workspace`，并在未提供时从当前目录向上查找最近 `okfh.config.yaml`；JSON 必须返回 resolved `workspace`
- [x] search / read / graph JSON 使用统一 CLI envelope：`ok`、`command`、`workspace`、`data`、`warnings`、`next`；命令专属 payload 只放在 `data` 内
- [x] search / read / graph 失败 JSON 也使用统一 envelope：`ok:false`、`data:{}`、`warnings:[]`、`next:[...]`，并返回 `error: { code, message, details? }`
- [x] Phase 5 固定错误码：`WORKSPACE_NOT_FOUND`、`INVALID_TARGET`、`TARGET_NOT_FOUND`、`AMBIGUOUS_SECTION`、`READ_LIMIT_EXCEEDED`、`NON_MARKDOWN_TARGET`、`NON_UTF8_TARGET`、`CONFIG_INVALID`、`SCAN_FAILED`、`GRAPH_WRITE_FAILED`
- [x] search / read / graph 非 `--json` 输出只做最小可读：search ranked list + path + type；read 标题 / path / 截断提示 / content；graph report path + open 提示；失败输出一句人话 + next step；不得做 TUI / 富交互，稳定机器契约只认 `--json`
- [x] Phase 5 将 `status` / `lint` 同步迁移为可省略 `--workspace` 的只读/维护命令，和 `search` / `read` / `graph` 一样从当前目录向上查找最近 `okfh.config.yaml`；JSON 返回 resolved `workspace`
- [x] Phase 5 更新 `okfh status --json`，在 `data.capabilities` 中返回 `search: "available"`、`read: "available"`、`graph: "available"`、`queryCommand: "not_available"`，让用户和 Agent 明确应该用 search/read 组合回答问题
- [x] `source add` / `ingest plan` 等 evidence-changing workflows 暂时保持显式 workspace，留给 Phase 6 统一评估，避免用户在错误目录里登记 source 或生成 ingest plan
- [x] read target 支持 concept id、workspace path、absolute bundle link 形式：`topics/x`、`wiki/topics/x.md`、`/topics/x.md`；reserved targets 支持 `index`、`log`、`wiki/index.md`、`wiki/log.md`；不得变成任意 workspace file reader
- [x] search 不自动运行完整 lint，也不因 lint warnings 阻塞；config / scan 失败才报错，单个坏 concept 文件可作为 warnings 跳过或降级处理
- [x] search 可索引 frontmatter 无效但正文可读的 markdown 文件；结果标记 `frontmatterOk: false`，title / type 使用 heading 或 path fallback，并返回 warning
- [x] read 只读 OKF bundle 内 `.md` 文本；非 UTF-8 / 非 markdown 失败；search 对超大 markdown 使用 `maxSearchBodyChars = 200000` 初始可调整上限，超过时只索引 metadata / title / path 并返回 warning
- [x] v0.1 保持 out-of-box：search 权重、扫描上限、read preview 上限作为代码中的初始默认常量，不暴露到 `okfh.config.yaml`；用户可调面只保留请求级 `limit` / section / range / full 等显式读取选择
- [x] Phase 5 不实现持久 search cache / SQLite FTS；每次确定性扫描 markdown，缓存和 FTS 留给后续 Search / Graph upgrades
- [x] `read index` 作为 reserved document bounded read，可额外返回 `indexLinks: [{ title, target, conceptId?, exists }]`
- [x] `read log` 作为 reserved document bounded read，可额外返回按日期 heading 解析的 `logEntries`；不做复杂时间线 UI
- [x] bounded read 默认返回 target / frontmatter / metadata / outline / links / citations / citationIssues / availableSections / content，不默认返回无界正文
- [x] read JSON 的 `data.content` 统一承载正文：`mode: "preview" | "section" | "range" | "full"`、`text`、`startOffset`、`endOffset`、`contentLength`、`returnedChars`、`truncated`；不要混用 `bodyPreview` / `body` / `fullText` 等字段
- [x] read JSON 的 `data` 顶层固定返回 `target`、`frontmatter`、`metadata`、`outline`、`availableSections`、`links`、`citations`、`citationIssues`、`content`、`source?`
- [x] read 解析 `# Citations` 中的 wiki reference paths 和 source IDs；对 source IDs 返回对应 source manifest metadata（path / title / sha256 / status 等），但不返回 raw source body
- [x] read 读取 Reference document 时，若 frontmatter `okfh.source_id` 可解析，顶层返回对应 `source` manifest metadata；非 Reference documents 的 source metadata 只通过 `citations` 暴露
- [x] read 遇到不存在的 cited source ID 或 reference path 时不失败，返回 `citationIssues` warning；正式坏引用检查仍由 lint 报告
- [x] read 目标文件 frontmatter 无效时尽量返回 bounded body preview，并返回 `frontmatter.ok=false` / warning；仅路径非法、文件不存在、非 UTF-8 等不可读场景失败
- [x] `defaultReadPreviewChars = 12000` 作为初始可调整默认值，不作为永久协议保证；长文档必须支持显式 full / section / range 读取
- [x] read continuation 优先支持 `--section <heading>`；对无清晰标题结构的文档支持 `--offset <n> --limit <n>` fallback
- [x] `availableSections` 返回 `sectionId`、`headingPath`、`heading`、`startOffset`、`endOffset`；重名 heading 的 `--section` 必须返回歧义错误并提示使用 `--section-id`
- [x] `read --full` 必须显式 opt-in 且受 `maxFullReadChars = 100000` 初始可调整硬上限约束；超过上限时拒绝并提示 section / range 读取
- [x] search 覆盖所有非保留 concept documents，包括 Reference documents；不搜索 `raw/sources/`
- [x] search query 支持最小 field filters：`type:<value>`、`tag:<value>`、`path:<prefix>`；其他 token 作为普通关键词处理，不引入复杂 DSL
- [x] search tokenization：英文按分隔符 token；中文连续字符生成 unigram + bigram；保留原始 query phrase 子串匹配；不引入分词依赖；小型内置中英文 stop words 仅用于 token scoring，不影响 phrase match
- [x] search 使用初始可调整权重：exact title/id/path +100；title phrase +60；id/path phrase +50；exact tag +40；type match +25；description phrase +20；title token +12/token cap 5；id/path token +10/token cap 5；tag token +8/token cap 5；description token +4/token cap 5；body phrase +4/occurrence cap 5；body unique token +2/token cap 10；`indexMentioned` +0；Reference type penalty +0
- [x] search 排序 tie-break：score desc → exact title/id/path first → title phrase first → concept id asc；返回 `scoreBreakdown`，并声明权重是实现默认值、后续可调整，但不是 v0.1 用户配置项
- [x] search JSON 的 `data.results[]` 是 candidate card，不返回 body snippet；每条结果固定返回 `conceptId`、`path`、`title`、`type`、`tags`、`description`、`frontmatterOk`、`indexMentioned`、`score`、`scoreBreakdown`、`matchedFields`、`bodyHitCount`
- [x] search JSON 的 `data` 顶层固定返回 `query`、`filtersApplied`、`limit`、`totalMatches`、`truncated`、`results`，让 Agent 能解释搜索范围和是否需要继续 broaden query
- [x] search results 返回 `indexMentioned: boolean`，表示该 concept 是否由根 `wiki/index.md` 直接链接；该字段不参与排序加分，v0.1 不递归使用子目录 index
- [x] search 默认 `limit = 10`、最大 `limit = 50`；JSON 返回 `limit`、`totalMatches`、`truncated`
- [x] search miss 返回清晰 next steps：读 index、换更宽关键词、如资料只在 source 中则先 ingest；v0.1 不自动触发 online search
- [x] lint 可补 `MISSING_INDEX_ENTRY` warning：非保留 concept 未出现在根 index 或对应子目录 index 中；不是 hard error，auto-fix 留给 maintain workflow
- [x] lint 补 `BROKEN_LINK` warning：解析 markdown links / OKF absolute bundle links，目标不存在时报 warning；auto-fix 留给 maintain workflow
- [x] lint 补 `MISSING_CITATIONS_SECTION` warning：Topic / Entity / Project / Decision 缺少 `# Citations` 且无 `okfh.sources` 时报警；Question 豁免
- [x] Phase 5 不实现 `STALE_TIMESTAMP` warning；staleness policy 依赖 workspace 用途，后续可通过 config 策略显式开启
- [x] Phase 5 不实现 `LARGE_UNSUMMARIZED_SOURCE` warning；该检查依赖成熟 source status / reference linking，留给后续 evidence pack 或 source audit
- [x] Phase 5 不实现 `ORPHAN_CONCEPT` warning；孤立概念 / knowledge gap 留给后续 graph insights，避免早期知识库噪音
- [x] backlink graph builder
- [x] `okfh graph` 不自动运行完整 lint；只返回 graph-specific `issues` / `missingTargets` 摘要，完整健康检查由 maintain workflow 显式先跑 lint
- [x] graph 默认节点只包含非保留 concept documents；`wiki/index.md` / `wiki/log.md` 不作为 graph nodes，index 链接只作为 metadata / navigation signal
- [x] `okfh graph --json` 默认不返回完整 `nodes` / `edges`，只在 envelope `data` 中返回 `report.htmlPath`、`report.backlinksPath`、`stats`、`issues`、`missingTargets`
- [x] 完整图数据写入 `.okfh/backlinks.json`；其中 edges 保留 directed shape：`from`、`to`、`kind`，供 Agent 在需要时单独读取
- [x] graph HTML 默认可以用无向连线展示，避免用户视图噪音
- [x] graph JSON summary / `.okfh/backlinks.json` 可记录 `missingTargets` / `issues`；graph HTML 不把 missing targets 渲染为普通节点，正式坏链 warning 仍归 lint
- [x] self-contained graph.html，可包含轻量交互：节点搜索、type filter、点击节点查看 path / type / title / links / citations；不做编辑、布局保存、community detection 或 graph insights
- [x] graph.html 不引入远程脚本或重型 graph runtime 依赖；v0.1 使用自包含 HTML + 内联极简 SVG/Canvas JS
- [x] graph 默认覆盖稳定输出 `.okfh/backlinks.json` 和 `.okfh/reports/graph.html`；不默认生成时间戳 report，后续如需留存可加 `--snapshot`
- [x] generated workspace `.gitignore` 默认忽略可重建 graph artifacts：`.okfh/backlinks.json`、`.okfh/reports/graph.html`
- [x] 更新 `packages/core/src/workspace/index.ts` workspace `.gitignore` 模板和相关测试，确保新 workspace 不把 graph artifacts 纳入默认 git diff
- [x] `okfh graph --open --json` 可选用 macOS 默认浏览器打开生成的 graph HTML；默认 `okfh graph` 不打开外部 UI，JSON 仍返回 report path
- [x] 更新 agent-pack `okf-harness-query` workflow 和 golden tests：locate workspace → read index → search → read relevant concepts → follow citations when needed → answer with concept paths / source IDs
- [x] `okf-harness-query` final answer 契约：先给直接答案，再给依据列表；依据必须列出 concept path 和可用 source IDs；如果只读到 wiki synthesis，应标注依据为 wiki concept；如果搜索命中弱或 citation 缺失，应说明知识库证据不足；不得假装读过 raw source
- [x] 更新 agent-pack `okf-harness-maintain` workflow：默认只运行 lint / repair；仅当用户要求 graph / visualize / graph report 时运行 `okfh graph`，但 final response 可提示用户可选择生成图谱
- [x] Phase 5 测试分三层：core 单元测试验证 search / read / graph 逻辑；CLI e2e 测 `okfh search` / `okfh read` / `okfh graph` / `okfh status` / `okfh lint --json` 的 envelope、错误码、workspace resolution；agent-pack golden tests 验证 Claude / Codex query 和 maintain workflow 使用真实 Phase 5 commands
- [x] Phase 5 只补 README 最小示例，不写完整使用手册：3-5 行自然语言 / CLI examples，展示 ask agent、`okfh search`、`okfh read`、`okfh graph` 的入口；完整 `docs/CLI.md` 留 Phase 7
- [x] Phase 5 实现和验证完成后，同步更新 README 和 AGENTS.md 的 current state，明确 search / read / graph 已实现；不做 npm version bump，除非进入 release 阶段

验收：core 层确定性 markdown / frontmatter search、bounded read、link / citation parsing、自包含 graph HTML 通过；CLI 层 JSON envelope、workspace resolution、limits、errors、status capabilities 有 e2e 测试；agent-pack query / maintain golden fixtures 更新，证明 Claude / Codex skills 使用 Phase 5 真 workflow 而不是 unavailable placeholder。

**Phase 6：Terminal-native hardening**

- [x] doctor 检查 `okfh`、git、Node.js、pnpm 和 workspace 状态
- [x] CLI 错误输出适合 Agent 解析和用户转述
- [x] Agent guidance 覆盖 Desktop App 和 TUI 的一致 shell command workflow

验收：Claude Code 和 Codex 在不依赖 MCP 的情况下完成 init / source add / ingest plan / lint / graph smoke test。

**Phase 7：Docs + examples + release prep**

- [x] README 用户流程（自然语言示例）
- [x] 上线版 README / docs 参考 tw93 项目组织风格：一句话定位、视觉或截图信号、badges、Why、Features、Quick Start、Usage / workflows、Docs index、FAQ / troubleshooting、Support、License；保持克制、示例优先、避免长 CLI 参考堆在 README 顶部
- [x] docs/ROADMAP.md（Obsidian 仅在 roadmap）
- [x] example workspace
- [x] macOS 安装说明
- [x] contribution guide / security policy
- [x] npm package metadata

### 11.3 Agent prompt 示例

给实现 Agent 的 prompt：

```
Phase 0：Read docs/IMPLEMENTATION.md. Implement Phase 0 only. Create the pnpm TypeScript monorepo scaffold for OKF Harness. Do not implement CLI behavior yet. Add minimal tests proving packages build. Run pnpm test and pnpm typecheck.

Phase 1：Implement Phase 1 core only. Add config parsing, OKF concept scanning, and hard OKF bundle linter rules. Use fixtures under packages/core/test/fixtures. Do not implement source ingest or manifest/hash drift checks. Add tests for missing frontmatter, missing type, reserved filenames, concept IDs, and path safety.

Phase 2：Implement Phase 2 CLI init/status/lint. The CLI must create the exact workspace structure from docs/IMPLEMENTATION.md. All commands must support --json. Add e2e tests using temporary directories. Do not implement Agent skills rendering yet; stub adapter files with placeholders only if necessary.

Phase 3：Implement Phase 3 Agent Pack. Replace any Phase 2 adapter placeholders with generated Claude Code and Codex adapters from shared templates. Generated guidance must teach agents to use `okfh --json` through local shell commands. Ensure generated skills satisfy Agent Skills naming and frontmatter requirements. Add golden tests. Do not implement MCP, Pi, OpenCode, or Obsidian.

Phase 4：Implement Phase 4 source management. Add manifest JSONL, file copy into raw/sources/YYYY/MM, URL metadata source files, source list, source integrity lint, and metadata-level ingest plan generation. Do not read or summarize source content automatically. The ingest plan should return a recommended reference path, candidate concepts based only on non-semantic metadata, and an Agent checklist; all semantic analysis belongs to the Agent ingest workflow. Add tests for hash drift, missing source, invalid manifest rows, reference source missing, unregistered raw source warning, duplicate file names, duplicate content, duplicate URL, rollback on failed registration, and dry-run.

Phase 5：Implement Phase 5 search/read/graph. Use a simple deterministic markdown/frontmatter search first. Build backlinks from markdown links and generate a self-contained graph.html with no remote assets. Add tests for absolute and relative OKF links.

Phase 6：Implement Phase 6 terminal-native hardening. Add doctor checks, clearer JSON errors, and smoke tests proving Claude Code and Codex can operate through `okfh --json` without MCP. Do not implement MCP unless the roadmap has been explicitly reopened.

Phase 7：Implement Phase 7 release prep. Write docs for a user who will mainly operate through Claude Code or Codex, not through CLI. Include macOS install, natural-language workflows, and explicit non-goals. Add Obsidian only to Roadmap. Do not add Obsidian code.
```

---

## 12. 测试策略

### 12.1 单元测试

必须覆盖：

- slug generation
- workspace path resolution
- config parse / validate
- frontmatter parse
- concept ID derivation
- OKF hard lint rules
- reserved filename handling
- manifest append / read
- source hash drift detection
- markdown link extraction

### 12.2 Golden Tests

必须覆盖所有生成文件：

- CLAUDE.md / AGENTS.md
- Claude skill SKILL.md files / Codex skill SKILL.md files

Golden tests 使用显式 fixtures，而不是只依赖测试框架的 `.snap` 文件。Fixtures 应放在 `packages/agent-pack/test/golden/` 下，方便 review 生成内容本身。

### 12.3 E2E 测试

用临时目录验证：

- `okfh init` → lint pass
- `okfh source add file` → manifest row + copied file + hash
- `okfh source add URL` → metadata source file
- `okfh ingest plan` → returns candidate reference path and affected concepts
- `okfh graph` → graph.html created

### 12.4 手动 Agent Smoke Test

手动 smoke test 是本地验收，不作为 CI 必过项；如果实现环境没有 Claude Code 或 Codex 客户端，报告为"自动验证通过，手动 agent discovery 未验证"。

**Claude Code**：

1. 打开空测试文件夹
2. 说："Initialize an OKF Harness workspace here for AI research."
3. 验证 skills 被发现
4. 验证 Agent 通过 local shell 执行 `okfh status --workspace <workspace> --json`
5. 说："Add examples/sources/llm-wiki.md and prepare an ingest plan."
6. 说："Now ingest it into the wiki and run lint."

**Codex**：

1. 在 Codex 中打开测试 workspace
2. 说："Use OKF Harness to initialize this workspace."
3. 验证 AGENTS.md guidance 被加载
4. 验证 `$okf-harness-*` skills 可用
5. 验证 Agent 通过 local shell 执行 `okfh status --workspace <workspace> --json`
6. 执行相同的 source add / ingest / lint 流程

---

## 13. 安全规范

### 13.1 文件安全

- v0.1 不删除任何用户文件
- source add 只能复制文件，不能移动（除非未来有显式 `--move` flag）
- 不修改 raw/sources
- 不在 workspace 外写入（读取外部 source path 做 copy 除外）
- 不跟踪写入 workspace 外的 symlink

### 13.2 Git 安全

使用 `--git` init 时：

- 如果当前不是 repo：运行 `git init`
- v0.1 不自动提交，除非用户明确要求
- Agent 编辑 wiki 前，检查 git status
- Agent 编辑 wiki 后，运行 git diff

### 13.3 Secret 处理

- 不在 `okfh.config.yaml` 或 agent guidance 文件中存储 API keys
- 仅使用环境变量引用
- 默认 .gitignore 排除 .env 文件

### 13.4 Agent 权限

v0.1 中 Claude / Codex skills 不授予宽泛的 auto-approved shell 权限。产品相关的 allowed-tools 可在后续威胁建模后添加。初始 skills 走正常的用户 / Agent 审批流程。

---

## 14. 用户体验

### 14.1 用户不需要学 CLI

CLI 是 Agent 使用的工具层。README 可以给开发者提供命令参考，但用户主流程必须写成自然语言。

README 首屏示例（英文）：

```
In Claude Code or Codex, open an empty folder and say:

"Set up an OKF Harness workspace for my AI research notes under ~/Documents. Use the default structure, install Claude and Codex agent support, and explain how I should add my first source."
```

中文示例：

```
帮我在 ~/Documents 下面创建一个 OKF Harness 知识库，名字叫 AI Research。请安装 Claude Code 和 Codex 支持，创建 inbox/source/wiki 结构，并告诉我之后怎么把资料丢进去。
```

### 14.2 自然语言到工具映射

| 用户自然语言 | Agent 应调用 |
|---|---|
| "帮我初始化知识库" | `okfh init ... --json` |
| "把这个文件加入知识库" | `okfh source add <path> --workspace <workspace> --json` |
| "整理 / 吸收这篇材料" | `okfh ingest plan <source> --workspace <workspace> --json`，然后 Agent 编辑 wiki |
| "问我的知识库" | `okfh search --json` + `okfh read --json` |
| "检查知识库健康" | `okfh lint --workspace <workspace> --json` |
| "生成图谱" | `okfh graph --json` |
| "安装 Claude / Codex 支持" | `okfh agent install claude\|codex\|all` |

Agent 优先使用 terminal-native tool channel 调用 `okfh --json`。CLI 不可用时，Agent 应提示用户安装或运行 `okfh doctor`，不要手写替代目录结构。

---

## 15. 发布与路线图

### 15.1 发布清单

GitHub 公开前必须完成：

- [ ] Repo 名为 okf-harness
- [ ] LICENSE 为 Apache-2.0
- [ ] README 有自然语言 Claude / Codex 示例
- [ ] docs/IMPLEMENTATION.md 就位
- [ ] docs/ROADMAP.md 将 Obsidian 放在 v0.3 之后
- [ ] `pnpm test` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `okfh init` e2e 测试在 macOS 通过
- [ ] 生成的 Claude skills frontmatter 校验通过
- [ ] 生成的 Codex skills name / description 校验通过
- [ ] 无 Obsidian runtime 代码
- [ ] Tier 2 代码没有半实现残留
- [ ] Claude Code 和 Codex smoke test 通过 terminal-native workflow
- [ ] Security policy 描述本地文件范围和零云端上传

NPM 发布包：

```
@okf-harness/core
@okf-harness/cli
@okf-harness/agent-pack
```

CLI package 的 bin 配置：

```json
{
  "bin": {
    "okfh": "dist/main.js",
    "okf-harness": "dist/main.js"
  }
}
```

### 15.2 README 必须包含

以用户为中心：

- OKF Harness 是什么
- macOS 安装
- 与 Claude Code 一起使用
- 与 Codex 一起使用
- 自然语言示例
- 文件放在哪
- 如何添加 sources
- 如何提问
- 如何运行健康检查
- Roadmap

README 不要以长 CLI 参考开头，CLI 参考放在 `docs/CLI.md`。

上线版 README / docs 参考 tw93 项目组织风格，但不照搬视觉语言或产品叙事。OKF Harness 文档应优先体现：一句话定位、开箱即用的第一步、agent-first 工作流、可验证 JSON / file contract、最短 CLI 示例、清晰 docs index、FAQ / troubleshooting、Support / License。README 保持克制，长命令和完整参数放 `docs/CLI.md`。

### 15.3 路线图

Public-facing roadmap lives in `docs/ROADMAP.md`. This implementation document remains the detailed phase gate for v0.1 work.

当前产品排序：

- **v0.1：Agent-first local MVP** — macOS only，Claude Code + Codex Tier 1，workspace init / linter / source manifest / source add / ingest plan / bounded search & read / graph HTML / project skills 和 guidance files。默认 tool channel 是 local shell + `okfh --json`，不依赖 MCP。
- **v0.2：Bounded evidence query pack** — 围绕有限 evidence pack、section/range read、truncation metadata 和 Agent query guidance，解决 query 阶段上下文爆炸问题。
- **Later：Agent adapter expansion** — Pi、OpenCode、adapter conformance tests、Tier 3 agent client 调研。
- **Later：Cross-platform terminal-native support** — Windows shell command support 和跨平台路径 / shell guidance hardening。
- **Later：Source connectors** — Feishu 等明确授权的 source registration / ingest workflow，不做默认云同步或后台爬取。
- **Later：Online source review and research collection** — 借鉴 Waza read / learn 的 URL/PDF fetch、privacy-first preview、多 source collect → fetch → file → digest 流程；必须显式注册 source，不进入 v0.1 query 默认行为。
- **Later：Search / graph upgrades** — SQLite FTS5 cache、更优排序、可选本地 embedding index，仅 rebuildable cache。
- **Later：Optional app and ecosystem integrations** — Raycast、Shortcuts、Finder Quick Action、Obsidian helper、optional MCP integration。MCP 不得替代 terminal-native default workflow。

---

## 16. 外部参考

这些参考链接在发布前应重新确认，因为 Agent 产品和 SDK 更新很快。

- [Karpathy LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Google Cloud OKF blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
- [OKF v0.1 spec](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [Agent Skills overview](https://agentskills.io/home)
- [Agent Skills specification](https://agentskills.io/specification)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Codex skills](https://developers.openai.com/codex/skills)
- [Codex config basics](https://developers.openai.com/codex/config-basic)
