# OKF Harness 开发文档

> Agent-first 的 macOS 本地知识库 Harness。
>
> 版本：v0.1-draft | 2026-06-15 | macOS only | Apache-2.0

## 1. 项目概述

OKF Harness 是一个开源的、本地优先的 OKF / LLM-Wiki Harness。它不是又一个完整知识库应用，也不是 Obsidian 插件。它的目标很窄：让用户在 Claude Code、Codex 等 Agent 里用自然语言完成初始化、文件整理、source ingest、wiki 查询、lint 和维护。CLI 只作为 Agent 的工具层和可调试后门，普通用户不需要记命令。

核心设计判断：**Agent 是主要交互界面，OKF markdown bundle 是数据契约，`okfh` CLI / MCP 是隐藏的 deterministic harness。**

### 1.1 命名与标识

| 项 | 值 |
|---|---|
| 公开项目名 | OKF Harness |
| GitHub 仓库 | `okf-harness` |
| CLI binary | `okfh`（长别名 `okf-harness`，文档统一用 `okfh`） |
| NPM scope | `@okf-harness/*` |
| MCP server name | `okf-harness` |
| License | Apache-2.0 |

NPM 包划分：

```
@okf-harness/core       # OKF 解析、校验、manifest、索引、路径安全
@okf-harness/cli        # okfh 命令行
@okf-harness/mcp        # stdio MCP server
@okf-harness/agent-pack # Claude / Codex adapter 生成器与共享 skill 模板
@okf-harness/mac        # macOS only 辅助工具，v0.2+ 可选
```

### 1.2 定位

> A macOS-first, agent-first harness for maintaining OKF-compatible local LLM Wikis from Claude Code, Codex, and future coding agents.

GitHub topics：`okf`, `open-knowledge-format`, `llm-wiki`, `agent-skills`, `claude-code`, `codex`, `mcp`, `macos`, `knowledge-management`

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
9. 生成 MCP config
10. 运行 lint 和 doctor
11. 告知用户下一步怎么用自然语言添加资料

### 2.2 v0.1 不做的事

不做 Obsidian plugin、不做 GUI、不做云同步、不做账号系统、不做团队权限、不做向量数据库、不做 background daemon、不做 Windows / Linux 支持、不做自动网页爬虫、不做自动 silent rewrite 大量 wiki 页面、不做私有 agent runtime。

### 2.3 MVP 验收标准

1. 新 macOS workspace 可由 Agent 初始化，lint pass
2. Claude Code 项目中自动发现 OKF skills
3. Codex 项目中自动发现 OKF skills
4. Claude Code 和 Codex 都能连接 okfh MCP stdio server
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
@okf-harness/agent-pack 依赖 core（workspace 路径和 config），不解析 raw sources
@okf-harness/mcp        包装 core，导出 tools
@okf-harness/cli        连接 core、agent-pack、mcp
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
| MCP | 稳定 MCP TypeScript SDK v1.x，SDK 代码集中在 packages/mcp/src/transport/ |

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
  .mcp.json
  .codex/
    config.toml
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

链接优先使用 bundle-root absolute markdown links：

```markdown
See [LLM Wiki](/topics/llm-wiki.md).
```

正文中来自外部 source 的事实性 claim，在页面底部 `# Citations` 中列出 source。内部 source mirror 可指向 `/references/...`。

---

## 6. CLI 参考

### 6.1 通用规则

所有命令都支持以下 flag：

- `--json`：machine-readable 输出
- `--dry-run`：不写文件，返回计划写入的内容
- `--workspace`：指定 workspace 路径，默认当前目录或最近 `okfh.config.yaml`
- `--quiet`：抑制非错误的人类可读文本

退出码：

```
0  成功
1  validation / lint 失败
2  用法错误
3  文件系统安全拒绝
4  缺少依赖
5  MCP / runtime 错误
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

### 6.2 核心命令

**okfh init**

```bash
okfh init ~/Documents/OKF\ Harness/ai-research \
  --name "AI Research" \
  --agents claude,codex \
  --mcp \
  --git \
  --json
```

行为：创建 workspace tree、写 config、写 OKF root index / log、写 Claude / Codex adapters、写 MCP config、按需 git init、运行 lint、返回下一步自然语言指令。

**okfh status**

```bash
okfh status --json
```

**okfh source add**

```bash
okfh source add ~/Downloads/paper.pdf --json
okfh source add https://example.com/article --json
```

行为：
1. 解析并校验路径
2. 拒绝目录（除非 `--recursive`）
3. 复制文件到 `raw/sources/YYYY/MM/<safe-slug>.<ext>`，不修改原文件
4. 计算 sha256
5. 追加 manifest 行
6. 返回 source id 和建议的自然语言下一步

URL 来源的行为：将 URL metadata 存储为 `raw/sources/YYYY/MM/<slug>.url.md`，不承诺完整网页抓取，由 Agent 自行决定是否用网络 / 浏览器工具获取内容。Manifest kind=url。

**okfh source list**

```bash
okfh source list --json
```

**okfh ingest plan**

```bash
okfh ingest plan src_20260615_0001 --json
```

返回 affected concepts、建议的 reference path、相关搜索结果和 checklist。v0.1 中不自行合成 wiki body。

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
okfh lint --json
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

**okfh mcp**

```bash
okfh mcp --workspace <path>
```

**okfh doctor**

```bash
okfh doctor --json
```

### 6.3 命令安全规则

每个读命令必须有 `--json`；每个写文件命令必须支持 `--dry-run`；每个可能覆盖文件的命令必须先生成 diff 或显式返回 pending action。

---

## 7. MCP 服务

### 7.1 启动

```bash
okfh mcp --workspace <workspace-path>
```

MCP server instructions 前 512 字必须自洽，因为 Codex 会用它辅助判断工具用途。

```
OKF Harness provides safe local tools for reading, searching, validating, and planning updates to this workspace's OKF-compatible wiki. Prefer read/search/ingest-plan before editing files. Do not modify raw/sources. Run lint after wiki edits. Use write-capable tools only with dryRun first unless the user explicitly asked to initialize or add a source.
```

### 7.2 工具列表

**只读工具**：

- `workspace_status()`
- `search_concepts(query, type?, tags?, limit?)`
- `read_concept(conceptId)`
- `list_sources(status?, limit?)`
- `read_source_manifest(sourceId)`
- `ingest_plan(sourceIdOrPath)`
- `lint()`
- `backlinks(conceptId)`

**可写工具**：

- `init_workspace(path, name?, agents?, dryRun?)`
- `add_source(input, kind?, title?, dryRun?)`
- `append_log(message, conceptId?, dryRun?)`
- `build_graph(dryRun?)`

v0.1 不通过 MCP 暴露任意 `write_file`。让 Claude / Codex 原生文件工具做编辑，由 Agent 指令和 lint 保护。这样 MCP 更聚焦，也更容易审计。

### 7.3 输出限制

MCP tools 返回紧凑结果。大输出写入 report file 并返回路径：

```json
{
  "summary": "32 concepts, 4 warnings",
  "reportPath": ".okfh/reports/lint-20260615-120000.json"
}
```

---

## 8. Agent 适配器

### 8.1 共享 Skill 模板

不维护两份独立 skill 副本。规范 skill 模板放在：

```
packages/agent-pack/templates/skills/
  okf-harness-init/SKILL.md + references/workflow.md
  okf-harness-ingest/SKILL.md + references/ingest-contract.md
  okf-harness-query/SKILL.md + references/answer-contract.md
  okf-harness-maintain/SKILL.md + references/lint-contract.md
```

`okfh agent install claude` 渲染到 `.claude/skills/`，`okfh agent install codex` 渲染到 `.agents/skills/`。产品差异通过模板注入，不靠手动分叉。

### 8.2 Skill 规范

所有 skill 名满足：小写字母 + 数字 + 连字符，不以下划线 / 空格 / 大写开头，不超过 64 字符，与 skill 目录名一致。所有 skill 描述必须包含"何时使用"和"何时不要使用"，因为 Codex 和 Claude 都靠 description 做自动触发。

Skill 生成模板：

```markdown
---
name: okf-harness-ingest
description: Add source material and compile it into an OKF-compatible LLM Wiki by creating reference pages, updating topic/entity/project pages, citations, index, and log. Use when the user asks to add, ingest, absorb, summarize into the wiki, or organize a new source. Do not use for general question answering without new sources.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex on macOS. Requires okfh CLI and optional okf-harness MCP server.
metadata:
  okf-harness-version: "0.1"
---

# OKF Harness Ingest

Use this skill to register source material and compile it into the local OKF wiki.

## Required behavior

1. Locate the workspace by finding `okfh.config.yaml`.
2. Prefer MCP tools when available. Fall back to `okfh` CLI.
3. If the source is not registered, run `okfh source add <path-or-url> --json`.
4. Run `okfh ingest plan <source-id-or-path> --json`.
5. Read the full source if available and safe.
6. Create or update exactly one `wiki/references/<slug>.md` page for the source.
7. Update affected `wiki/topics/`, `wiki/entities/`, `wiki/projects/`, `wiki/decisions/`, or `wiki/questions/` pages.
8. Preserve uncertainty and contradictions. Do not erase unresolved tension just to make a clean narrative.
9. Add or update `# Citations` sections.
10. Update `wiki/index.md` and relevant subdirectory indexes.
11. Append `wiki/log.md`.
12. Run `okfh lint --json`.
13. Show the user changed files, lint status, and unresolved questions.

## Hard rules

- Never edit `raw/sources/`.
- Never invent source IDs, citations, dates, or claims.
- Prefer small patches.
- If more than 20 wiki files seem affected, stop after an ingest plan and ask the user to narrow scope.
- Run `git diff` before final response when file changes were made.

See [the ingest contract](references/ingest-contract.md) for exact page templates.
```

### 8.3 Skill 清单

**okf-harness-init**：初始化 workspace、第一次设置、文件组织、Agent 支持安装。

```yaml
description: Initialize and organize an OKF Harness knowledge workspace on macOS, including folders, git, OKF wiki files, Claude/Codex adapters, and MCP config. Use when the user asks to set up, create, initialize, organize, or install OKF Harness support. Do not use for ingesting an already-added source.
```

**okf-harness-ingest**：添加 source、生成 ingest plan、编译 source 到 wiki。

```yaml
description: Add source material and compile it into an OKF-compatible LLM Wiki by creating reference pages, updating topic/entity/project pages, citations, index, and log. Use when the user asks to add, ingest, absorb, summarize into the wiki, or organize a new source. Do not use for general question answering without new sources.
```

**okf-harness-query**：查询知识库。

```yaml
description: Answer questions using the local OKF Harness wiki by searching concepts, reading full pages, following citations, and citing concept paths. Use when the user asks what their knowledge base says, asks a research question, or requests synthesis from existing wiki knowledge. Do not use to ingest new source material.
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
.mcp.json
```

`CLAUDE.md` 保持精短：

```markdown
# OKF Harness workspace

This repository is an OKF Harness knowledge workspace.

Use the project skills for user-facing workflows:

- `/okf-harness-init` for first-time setup and adapter repair.
- `/okf-harness-ingest` for adding or compiling sources.
- `/okf-harness-query` for answering from the wiki.
- `/okf-harness-maintain` for lint, repair, and graph reports.

Rules:

- `raw/sources/` is immutable. Never edit source files.
- `wiki/` is the OKF bundle and may be edited by the agent.
- Prefer MCP tools from `okf-harness` when available.
- Run `okfh lint --json` after modifying wiki files.
- Run `git diff` before final response after any file changes.
```

`.mcp.json`：

```json
{
  "mcpServers": {
    "okf-harness": {
      "type": "stdio",
      "command": "okfh",
      "args": ["mcp", "--workspace", "${CLAUDE_PROJECT_DIR:-.}"],
      "env": {}
    }
  }
}
```

注意事项：项目 `.mcp.json` 需要用户在 Claude Code 中批准。Agent 应在工具不可用时提示用户运行 `/mcp`。v0.1 不依赖 project hooks，不发 Claude plugin。

### 8.5 Codex 适配

生成文件：

```
AGENTS.md
.agents/skills/<skill>/SKILL.md
.codex/config.toml
```

`AGENTS.md`：

```markdown
# OKF Harness workspace

This repository is an OKF Harness knowledge workspace.

Use repo skills for workflows:

- `$okf-harness-init` for first-time setup and adapter repair.
- `$okf-harness-ingest` for adding or compiling sources.
- `$okf-harness-query` for answering from the wiki.
- `$okf-harness-maintain` for lint, repair, and graph reports.

Rules:

- `raw/sources/` is immutable. Never edit source files.
- `wiki/` is the OKF bundle and may be edited by the agent.
- Prefer MCP tools from `okf-harness` when available.
- Run `okfh lint --json` after modifying wiki files.
- Run `git diff` before final response after any file changes.
```

`.codex/config.toml`：

```toml
[mcp_servers.okf-harness]
command = "okfh"
args = ["mcp", "--workspace", "."]
startup_timeout_sec = 10
tool_timeout_sec = 60
enabled = true
default_tools_approval_mode = "prompt"
```

注意事项：repo-scoped `.codex/config.toml` 仅在受信任项目中加载。`AGENTS.md` 必须短小，长流程放 skills。Codex skills 必须有 `name` 和 `description`。v0.1 不依赖 Codex plugins，直接 repo skills 更简单。

---

## 9. 核心模块

### 9.1 Source 与 Manifest 管理

**Manifest 格式**：`.okfh/manifest.jsonl`，append-friendly JSONL。

```json
{"id":"src_20260615_0001","kind":"file","original":"/Users/me/Downloads/article.pdf","path":"raw/sources/2026/06/article.pdf","sha256":"...","title":"Article","added_at":"2026-06-15T12:00:00-07:00","status":"registered","reference_concept":"wiki/references/article.md"}
```

字段：

| 字段 | 说明 |
|---|---|
| id | 稳定的 source id |
| kind | file / url / text / clipboard / folder / unknown |
| original | 原始路径或 URL（安全可存储时） |
| path | raw/sources 下的本地路径 |
| sha256 | 存储后的 hash |
| mime | 检测到的 MIME |
| title | 人类可读标题 |
| added_at | ISO 时间戳 |
| status | registered / planned / ingested / superseded / error |
| reference_concept | wiki reference page 路径（创建后） |
| notes | 可选短文本 |

**Raw immutability**：`raw/sources/` 文件默认不可修改。`okfh lint` 检查 stored sha256 与 manifest 一致，不一致输出 `SOURCE_HASH_DRIFT`。Agent skills 必须明确不编辑 `raw/sources/`；如需修正 source，添加新 source 并将旧 source 标记 superseded。

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
2. 执行 `okfh init --agents claude,codex --mcp --git --json`
3. 读取 JSON 结果
4. 如果 MCP 需要审批，告知用户如何审批
5. 执行 `okfh status --json`
6. 用日常语言解释目录结构
7. 建议第一步：把文件放进 raw/inbox，或让 Agent 添加文件 / 链接

Agent final response 必须包含：workspace 路径、已安装的 adapters、MCP 状态或审批提示、下一步自然语言示例。

### 10.2 Init 策略

```
用户提供路径：使用该路径
用户只提供名字：使用 ~/Documents/OKF Harness/<slug-name>
用户没有提供名字：使用 Personal Knowledge，生成 personal-knowledge slug
目标目录不存在：创建
目标目录存在但非空：不覆盖，先运行 okfh doctor 或建议创建子目录
没有 git repo：运行 git init
用户没有指定 agent：默认安装 Claude + Codex Tier 1
MCP 需要审批：告知用户运行 /mcp 或检查状态
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

1. 执行 `okfh lint --json`
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
    mcp/src/
      server.ts tools/
    mcp/test/
    agent-pack/src/
      render.ts adapters/claude.ts codex.ts
      templates/ skills/ CLAUDE.md.hbs AGENTS.md.hbs mcp.json.hbs codex.config.toml.hbs
    agent-pack/test/
    mac/src/ test/
  templates/workspace/
  examples/minimal-workspace/ sources/
  scripts/
```

### 11.2 实现阶段

按以下顺序实现，不提前做后面的阶段。

**Phase 0：Repo scaffold**

目标：创建 monorepo、基础工具链、空包、CI。

- [ ] package.json + pnpm-workspace.yaml
- [ ] TypeScript config
- [ ] Vitest config
- [ ] ESLint / Prettier 或 Biome
- [ ] packages/core, cli, mcp, agent-pack
- [ ] root README skeleton
- [ ] LICENSE Apache-2.0
- [ ] GitHub Actions: install, typecheck, test

验收：`pnpm install`、`pnpm test`、`pnpm typecheck` 通过，无 runtime 行为。

**Phase 1：Core OKF + config + 路径安全**

- [ ] Workspace config schema
- [ ] Path resolver
- [ ] Frontmatter parser
- [ ] Concept scanner
- [ ] OKF hard linter
- [ ] Fixture workspace tests

验收：config 解析、OKF concept 扫描、hard OKF linter rules 通过 fixture 测试。

**Phase 2：CLI init / status / lint**

- [ ] okfh binary
- [ ] init / status / lint 命令
- [ ] JSON output envelope
- [ ] workspace template generation
- [ ] git init 可选

验收：CLI 创建符合规范的 workspace 结构，所有命令支持 `--json`，e2e 测试通过临时目录完成。

**Phase 3：Agent pack**

- [ ] 共享 skill 模板
- [ ] Claude renderer / Codex renderer
- [ ] CLAUDE.md / AGENTS.md / .mcp.json / .codex/config.toml renderer
- [ ] Golden snapshot tests

验收：生成的 skills 满足 Agent Skills 命名和 frontmatter 要求，golden tests 通过。

**Phase 4：Source manifest + source add + ingest plan**

- [ ] Manifest JSONL read / write
- [ ] sha256 hashing
- [ ] source add（file + URL metadata）
- [ ] source list
- [ ] ingest plan generator
- [ ] raw source immutability lint rule

验收：hash drift、重复文件名、dry-run 测试通过。

**Phase 5：Search + read + graph**

- [ ] search / read 命令
- [ ] backlink graph builder
- [ ] self-contained graph.html

验收：确定性 markdown / frontmatter search 和自包含 graph HTML 通过。

**Phase 6：MCP server**

- [ ] stdio MCP server
- [ ] workspace_status / search_concepts / read_concept / list_sources / ingest_plan / lint 工具
- [ ] add_source / init_workspace 工具（带 dryRun）

验收：工具 handler 集成测试通过，使用稳定 MCP TypeScript SDK。

**Phase 7：Docs + examples + release prep**

- [ ] README 用户流程（自然语言示例）
- [ ] docs/ROADMAP.md（Obsidian 仅在 roadmap）
- [ ] example workspace
- [ ] macOS 安装说明
- [ ] contribution guide / security policy
- [ ] npm package metadata

### 11.3 Agent prompt 示例

给实现 Agent 的 prompt：

```
Phase 0：Read docs/IMPLEMENTATION.md. Implement Phase 0 only. Create the pnpm TypeScript monorepo scaffold for OKF Harness. Do not implement CLI behavior yet. Add minimal tests proving packages build. Run pnpm test and pnpm typecheck.

Phase 1：Implement Phase 1 core only. Add config parsing, OKF concept scanning, and hard OKF linter rules. Use fixtures under packages/core/test/fixtures. Do not implement source ingest or MCP. Add tests for missing frontmatter, missing type, reserved filenames, concept IDs, and path safety.

Phase 2：Implement Phase 2 CLI init/status/lint. The CLI must create the exact workspace structure from docs/IMPLEMENTATION.md. All commands must support --json. Add e2e tests using temporary directories. Do not implement Agent skills rendering yet; stub adapter files with placeholders only if necessary.

Phase 3：Implement Phase 3 Agent Pack. Generate Claude Code and Codex adapters from shared templates. Ensure generated skills satisfy Agent Skills naming and frontmatter requirements. Add golden tests. Do not implement Pi, OpenCode, or Obsidian.

Phase 4：Implement Phase 4 source management. Add manifest JSONL, file copy into raw/sources/YYYY/MM, URL metadata source files, and ingest plan generation. Do not summarize source content automatically. The ingest plan should identify likely existing concepts using index/search. Add tests for hash drift, duplicate file names, and dry-run.

Phase 5：Implement Phase 5 search/read/graph. Use a simple deterministic markdown/frontmatter search first. Build backlinks from markdown links and generate a self-contained graph.html with no remote assets. Add tests for absolute and relative OKF links.

Phase 6：Implement Phase 6 MCP server using the stable MCP TypeScript SDK. Expose only the tools listed in docs/IMPLEMENTATION.md. Keep write-capable tools dry-run friendly and path safe. Add integration tests that call the tool handlers directly; do not require a live Claude/Codex client in CI.

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
- .mcp.json / .codex/config.toml

### 12.3 E2E 测试

用临时目录验证：

- `okfh init` → lint pass
- `okfh source add file` → manifest row + copied file + hash
- `okfh source add URL` → metadata source file
- `okfh ingest plan` → returns candidate reference path and affected concepts
- `okfh graph` → graph.html created

### 12.4 手动 Agent Smoke Test

**Claude Code**：

1. 打开空测试文件夹
2. 说："Initialize an OKF Harness workspace here for AI research."
3. 验证 skills 被发现
4. 验证 `/mcp` 显示 okf-harness pending 或 active
5. 说："Add examples/sources/llm-wiki.md and prepare an ingest plan."
6. 说："Now ingest it into the wiki and run lint."

**Codex**：

1. 在 Codex 中打开测试 workspace
2. 说："Use OKF Harness to initialize this workspace."
3. 验证 AGENTS.md guidance 被加载
4. 验证 `$okf-harness-*` skills 可用
5. 验证 MCP server 已激活或 config 已就位
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

- 不在 `okfh.config.yaml`、`.mcp.json`、`.codex/config.toml` 中存储 API keys
- 仅使用环境变量引用
- 默认 .gitignore 排除 .env 文件
- MCP server 不暴露任意环境变量

### 13.4 Agent 权限

v0.1 中 Claude / Codex skills 不授予宽泛的 auto-approved shell 权限。产品相关的 allowed-tools 可在后续威胁建模后添加。初始 skills 走正常的用户 / Agent 审批流程。

---

## 14. 用户体验

### 14.1 用户不需要学 CLI

CLI 是 Agent 使用的工具层。README 可以给开发者提供命令参考，但用户主流程必须写成自然语言。

README 首屏示例（英文）：

```
In Claude Code or Codex, open an empty folder and say:

"Set up an OKF Harness knowledge workspace for my AI research notes under ~/Documents. Use the default structure, install Claude and Codex agent support, and explain how I should add my first source."
```

中文示例：

```
帮我在 ~/Documents 下面创建一个 OKF Harness 知识库，名字叫 AI Research。请安装 Claude Code 和 Codex 支持，创建 inbox/source/wiki 结构，并告诉我之后怎么把资料丢进去。
```

### 14.2 自然语言到工具映射

| 用户自然语言 | Agent 应调用 |
|---|---|
| "帮我初始化知识库" | `okfh init ...` 或 MCP `workspace.init` |
| "把这个文件加入知识库" | `okfh source add <path>` |
| "整理 / 吸收这篇材料" | `okfh ingest plan <source>`，然后 Agent 编辑 wiki |
| "问我的知识库" | MCP `search_concepts` + `read_concept` |
| "检查知识库健康" | `okfh lint --json` |
| "生成图谱" | `okfh graph --json` |
| "安装 Claude / Codex 支持" | `okfh agent install claude\|codex\|all` |

Agent 优先使用 MCP tools；MCP 不可用时用 CLI。CLI 不可用时，Agent 应提示用户安装或运行 `okfh doctor`，不要手写替代目录结构。

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
- [ ] MCP server 通过 stdio 启动
- [ ] Security policy 描述本地文件范围和零云端上传

NPM 发布包：

```
@okf-harness/core
@okf-harness/cli
@okf-harness/mcp
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

### 15.3 路线图

**v0.1：Agent-first local MVP**

macOS only，Claude Code + Codex Tier 1，OKF workspace init / linter / source manifest / source add / ingest plan / search & read / graph HTML / MCP stdio server / project skills 和 guidance files。

**v0.2：Tier 2 Agent 适配器**

Pi adapter、OpenCode adapter、adapter conformance tests、可选 AGENTS.md 优化。

**v0.3：macOS 便捷层**

Raycast extension、Shortcuts actions、Finder service / Quick Action、可选 Desktop inbox alias、可选 menu bar status app。

**v0.4：Obsidian 集成**

Obsidian plugin 或 helper、以 vault 方式打开 workspace、Graph handoff、可选 wikilink 兼容模式，无 proprietary lock-in。

**v0.5：搜索升级**

SQLite FTS5 cache、更优排序、可选本地 embedding index，仅 rebuildable cache。

**Tier 3 生态（远期）**：Cursor、VS Code generic MCP clients、Aider、Goose、Continue、GitHub Copilot coding agent。

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
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Codex skills](https://developers.openai.com/codex/skills)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Codex config basics](https://developers.openai.com/codex/config-basic)
- [MCP intro](https://modelcontextprotocol.io/docs/getting-started/intro)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
