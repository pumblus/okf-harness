# OKF Harness 路线图

[English](../ROADMAP.md) | 中文

这是 OKF Harness 的公开产品路线图。路线图条目不是版本承诺。想法只有在具备清晰用户故事、安全边界和验证路径后，才会进入确定工作。

## 定位

OKF Harness 是一个 agent 原生、文件契约优先、无需独立应用的知识管理工具。

它是一个独立项目，基于 Andrej Karpathy 的 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式，以及 Google 的 [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)。

本项目与 Andrej Karpathy 或 Google 没有关联，也不代表其背书。

它与完整桌面 LLM Wiki 应用的核心区别是有意为之：OKF Harness 不试图成为主要的知识库应用。你继续在 Claude Code、Codex 和未来的 agent 客户端中工作；harness 在普通 markdown 文件之上提供透明的本地 workspace、确定性 CLI、受控读取、lint 和图谱报告。

这意味着 OKF Harness 的竞争力应体现在：

- Agent 原生工作流，而非捆绑的桌面 GUI
- 可检查的 markdown 和 JSON 契约，而非隐藏的应用状态
- 受控证据和显式溯源，而非无限制的上下文填充
- 通过 `okfh --json` 实现的本地优先、可审计操作
- 可选集成，不替代默认的终端原生工作流

## 当前重点

目标：让 OKF Harness 通过本地、终端原生工作流在 Claude Code 和 Codex 中可用。

包含：

- 支持 macOS、Windows 和 Linux 的本地 workspace 初始化
- Claude Code 和 Codex 的 agent 适配
- 来源注册，含原始资料不可变性和 manifest 完整性
- 元数据级别的 ingest plan
- 确定性 wiki 搜索和读取
- 自包含的本地图谱报告
- 覆盖 POSIX shell、PowerShell 和 Command Prompt 核心命令的终端原生加固
- 发布文档

设计克制：

- 面向用户的文档应优先展示给 agent 的自然语言 prompt，而不是命令教程
- 回答基于已整理的 `wiki/` 内容，而非跨原始资料的全文发现
- 没有 `okfh query` 或 LLM 回答命令，agent 通过组合 `search` 和 `read` 来回答问题
- 搜索结果返回候选概念文档，不是答案证据
- 读取默认受控，并提供显式续读选项
- 图谱展示概念链接和证据链接，原始资料文件保留为元数据而非图谱节点
- GUI、云端同步、用户账户、向量搜索、RAG、自动网页抓取和 Obsidian 运行时代码，会留在需求分层里，直到它们能保留本地化、可检查的工作流

## 高需求

### OKF 合规与 Harness Lint 分层

目标：先证明一个 workspace 中的 OKF bundle 符合标准可读的最低要求，再给出 OKF Harness 自己的质量改进建议。

发布方向：当用户故事、安全边界和验证路径明确后，这应成为下一版 release 的主产品主题。

Release 主题：OKF Harness 为 agent 提供一个清晰入口，并先检查 workspace 是否 OKF 可读，再让 agent 继续维护它。

下一版范围应聚焦在 `check`、统一的 `okf-harness` agent 入口、当前 agent 优先的初始化、显式 workflow 调用、分层 fixtures、回归测试，以及文档或 agent 指引同步。受控证据规划应保留为单独路线图条目，不与这一版 release 主题混在一起。

候选范围：

- 在面向用户的验证输出中区分 OKF 合规结果和 Harness lint 结果
- 为 agent 和用户保留一个常规验证工作流，在输出内部展示分层结果
- 优先采用面向用户的 `check` 工作流，而不是把 `lint` 作为并行命令面长期保留
- check 默认只报告不修改；修改 workspace 必须来自用户明确请求，例如 "check and fix"
- 当用户明确要求修复 check 发现时，自动修复范围应保持很窄：只自动修改缺失 index entry、明显断开的内部链接等低风险结构问题；证据、来源、引用或大段重写问题应报告并给出建议下一步
- 如果旧的 `lint` 命令被移除，应返回清晰的 "Use check instead" 提示，而不是维护重复行为
- 在详细问题代码之前，先用 `Ready`、`Needs attention` 或 `Blocked` 报告普通语言检查状态，其中 `Blocked` 只用于 OKF 合规硬失败
- 在 check 输出中显示用于合规检查的 OKF version，例如 `0.1`
- 第一版 `check` 固定报告 `OKF version: 0.1`，不增加让用户选择 target 的参数
- Harness package version 可出现在 JSON 或排错输出中，但不要在面向用户的 check 第一层摘要里突出显示
- human-readable check 输出应保持简洁，包含状态、OKF version、合规结果、lint 摘要和按优先级分组的问题；完整细节保留在 JSON 中供 agent 使用
- `check --json` 保持现有 CLI envelope 形态，并把状态、OKF version、OKF 合规和 Harness lint 详情放在 `data` 下
- 在 `check --json` 中，`Ready` 和 `Needs attention` 的顶层 `ok` 都应为 `true`；只有 `Blocked` 或命令级失败时才是 `false`
- check 退出码与顶层 `ok` 对齐：`Ready` 和 `Needs attention` 退出 0，`Blocked` 或命令级失败退出非 0；这一版不增加 strict mode
- 保持顶层状态简单，但为 Harness lint 发现分配 high、medium、low 等优先级
- 告诉 agent：高优先级 Harness lint 问题需要风险提示，但只应阻止直接依赖受影响来源或 reference 的回答
- 这一版把普通缺引用作为 medium-priority Harness lint；更语义化的升级规则，例如事实密集页面无引用时升为 high，可留到以后
- 明确哪些发现属于 OKF 规范要求，哪些属于 OKF Harness 的溯源、引用或可维护性检查
- 保持宽容 consumer 行为可见：断链和引用覆盖不足不应被误标为 OKF 规范硬失败
- OKF 合规硬失败应保持最小集合：只有 OKF 规范明确不允许的情况才标为 hard failure
- 不要把断链、缺引用、缺索引入口、未知 frontmatter key、未知 type 值或来源哈希漂移当作 OKF 合规硬失败
- 增加用场景命名、非开发者也能理解的 fixture workspace，包括 `ready-workspace`、`blocked-missing-frontmatter`、`blocked-bad-log-heading`、`needs-attention-source-drift`、`needs-attention-missing-citations`、`needs-attention-broken-link` 和 `large-page-bounded-read`
- 在 `check` 工作流实现时更新 agent 指引，让 Claude Code 和 Codex 先报告合规状态，再建议更广泛的清理
- 让初始化变成当前 agent 优先：用户在正常 prompt-first flow 里不需要选择 Claude Code 或 Codex adapter 名称
- 在可行时由 agent 指引判断当前 agent 客户端；CLI 应接收明确的 agent 输入，而不是从 shell 环境里猜调用方
- 暂时保留现有 `--agents` CLI 形态，但让 agent 指引显式传入当前 agent，而不是让普通初始化默认使用 `all`
- 对直接 CLI 使用，不让初始化默认变成 `--agents all`；要求明确选择 `codex`、`claude` 或 `all`，并返回确定性错误而不是交互式询问
- adapter repair 或 install flow 也遵循同样的当前 agent 优先规则：`all` 仍然可用，但只能作为明确选择，而不是推荐默认
- 保留 `--agents none` 给高级或开发者场景，但不放进 README 入口路径，也不在普通 agent 指引中使用
- 当前 agent 初始化后，在可行时检测本机其他受支持的 agent 客户端，并在为它们准备 workspace 指引前询问用户
- 这一版由于只支持 Claude Code 和 Codex，其他 agent 检测应保持保守；依赖明显的 workspace 指引文件或低风险 PATH 检查，不做全盘扫描或读取应用私有目录
- 如果未检测到其他受支持的 agent 客户端，就不要提跨 agent 适配
- 初始化或指引变更后，提醒用户用当前客户端自己的叫法开启新的 agent 对话，例如 Claude Code 的 session 或 Codex 的 thread
- README 初始化 prompt 应保持自然；新 session 或新 thread 的提醒应由 agent 指引在初始化完成后给出
- README 入口应先给简短的 `Before you start` 前提说明，再给 `Start with your agent` workflow 调用 prompt，并把 CLI reference 后移
- 用户可以自己运行 npm 安装命令，也可以让 agent 检查安装状态；但 agent 执行全局安装前必须得到用户明确授权
- README 入口 prompt 应按用户状态分组：还没有 workspace、已经有 workspace，然后单独列出添加 source 作为常见下一步
- README 入口示例应使用 Codex 的 `$okf-harness`、Claude Code 的 `/okf-harness` 等显式 workflow 前缀，让路由更可预测
- Codex 和 Claude Code prompt 应分开展示，不使用通用 `<prefix>` 模板
- 用一个 `okf-harness` agent 入口替代多个面向用户的 workflow skill 名称，并在内部路由 setup、check、ingest、answer 和 graph 意图
- unified skill 应保持分层：主 `SKILL.md` 负责意图路由和 hard rules，setup、check、ingest、answer 和 graph 细节放进 reference 文件
- 对旧的 workflow-specific skill 名称采用 clean break：新 workspace 只生成 `okf-harness`，repair 或 upgrade flow 应移除旧的 OKF Harness-managed workflow skills，同时保留用户自写文件
- clean break 删除只能作用于标记为 OKF Harness-managed 的文件；用户自写或格式异常的文件应保留并报告冲突
- 显式 workflow 前缀建立 OKF Harness 语境后，示例 prompt 应使用 `workspace` 这类自然简称，而不是每句话都重复产品术语
- README prompt 应保持自然简短；不要让用户重复 OKF Harness 指引本应保证的行为，例如读取 wiki 页面或引用证据
- answer workflow 应具备 check-aware 行为，但不要在每次回答前都运行完整 workspace check；可信时使用最近状态，状态缺失、过期或有风险时再运行 check
- 这一版不加入复杂的 check 状态缓存；answer workflow 可先检查 `status`，只在需要时运行 `check`
- `status` 保持快速概览，不变成第二个完整 check；它可以暴露简洁的 check status 供 answer routing 使用，但详细 findings 属于 `check`
- 持续改进 skill 描述中的自然语言路由质量，但不把无前缀路由作为稳定 README 路径或 release blocker

约束：

- 不把 OKF Harness 偏好说成 OKF 规范规则
- 不让合规检查依赖 Obsidian、GUI、embedding、云服务或来源连接器
- 保留 agent 可确定性检查的 JSON 输出

### 受控证据规划

目标：让 agent 回答可靠且不超出上下文窗口。

候选范围：

- `okfh evidence plan <question> --json` 或等价的证据包命令
- 确定性检索预算，对索引、候选页面、引用和响应空间设置上限
- 显式的 `truncated`、`contentLength` 和续读元数据
- Agent 指引，教 Claude Code 和 Codex 如何从受控证据中回答
- 证明大型 wiki 页面不会产生无界 JSON 或上下文负载的测试

约束：

- 默认不加语义 embedding 索引
- 不加声称"理解"wiki 的隐藏摘要
- 除非用户明确进入 ingest 或来源审计工作流，否则不搜索原始资料

### Agent 适配器扩展

目标：支持更多 agent 客户端，同时不削弱默认的本地 shell 模型。

候选：

- Pi 适配器
- OpenCode 适配器
- 跨客户端共享的适配器一致性测试
- 每新增一个 adapter 时继续完善 supported-agent detection
- 调研 Cursor、VS Code、Aider、Goose、Continue 和 GitHub Copilot coding agent

约束：新适配器必须保持与 Claude Code 和 Codex 相同的工作流契约，不应将私有运行时强塞进默认产品路径。

## 中需求

### 来源连接器

目标：让用户从常用工作工具中导入资料，同时保留溯源和显式的用户控制。

候选想法：飞书 / Lark 支持。

可能的形式：

- 将飞书文档 URL 注册为 URL 来源指针
- 将飞书文档导出为 markdown 或 PDF，再注册导出文件为资料来源
- 提供连接器工作流，仅在用户明确授权后抓取内容

待解决问题：

- "飞书支持"是指一次性文档导入、整个 workspace/wiki 导入、评论抓取，还是持续同步？
- OKF Harness 应该使用飞书 API、浏览器辅助导出，还是用户提供的导出文件？
- 需要什么凭证，存储在哪里？
- 如何防止私有公司内容泄露到日志、manifest 或公开路径中？
- 更新内容时是创建新的原始来源，还是修改已有来源记录？

约束：连接器应服务于来源注册或 ingest，默认不做云端同步或后台抓取。

### 在线来源审查和研究收集

目标：帮助用户在材料进入 OKF Harness workspace 之前查找、检查和收集在线资料。

候选范围：

- URL 和 PDF 的简洁、来源锚定预览
- 将抓取内容显式保存并通过正常来源注册路径进入 workspace
- 代理或第三方抓取服务必须可选，并附带隐私警告
- Agent 指引："查找关于 X 的资料，展示候选，然后注册我认可的那些"
- 面向飞书/Lark、微信、GitHub、PDF 和重度 JS 页面提供不同抓取路径

约束：

- 搜索未命中应建议添加资料或扩大 wiki 搜索，而非自动触发在线搜索
- 在线来源审查是候选优先：agent 在注册任何内容之前展示可能的来源
- URL 的默认注册方式仍是 URL 来源指针；抓取内容快照需要用户明确表达意图
- 抓取的网页内容是不可信数据，其中的嵌入指令不能成为 agent 指令
- 在线搜索不能悄悄添加或改写 wiki 内容

### 审查队列

目标：保留人工判断，不依赖完整 GUI。

候选范围：

- Markdown 原生的审查文件，用于未解决问题、矛盾点和建议的后续行动
- Agent 工作流：列出、解决和关联审查项
- Lint 检查：过时或孤立的审查项

约束：审查项应是显式的 workspace 文件，而非隐藏应用状态。

### 轻量生态文档

目标：帮助用户在 OKF Harness workspace 周边使用现有 markdown 工具，同时不让这些工具成为产品中心。

候选范围：

- 说明如何把 `wiki/` 作为 Obsidian vault 或 vault 子目录打开
- 解释哪些 Obsidian 功能适合 OKF bundle，哪些可能意外改写 frontmatter 或链接
- 展示即使用 Obsidian 阅读或轻量编辑，agent-first workflow 仍然是维护行为的来源

约束：短期 Obsidian 支持应以文档优先，不把 Obsidian 运行时依赖或插件放进默认产品路径。

## 低需求

### 搜索和图谱升级

目标：改进检索和结构理解，同时保持缓存可重建且可选。

候选：

- `.okfh/cache/` 下的 SQLite FTS5 缓存，作为可重建搜索加速器
- 更好的确定性排序
- 过滤器改进：类型 facet、包含/排除过滤、日期或状态过滤、保存的搜索配方、agent 可读的过滤建议
- 可选混合检索：用可解释的合并策略组合确定性关键词结果和向量结果
- 可选的本地 embedding 缓存
- 图谱洞察：孤立概念、弱证据链接和桥接概念

约束：

- 任何缓存都必须能从 OKF bundle 和来源 manifest 重建
- 向量检索保持可选，不进入默认路径
- 仅在存在第二个检索器时才考虑排名融合
- 跨原始资料的全量查询搜索不应成为默认查询行为

### 可选应用和生态集成

候选：

- Raycast 扩展
- Shortcuts 动作
- Finder 快速操作
- 超出基础文档的 Obsidian 友好辅助工具或插件

约束：

- 任何集成都不能替代默认的终端原生 `okfh --json` 工作流
- Obsidian 保持可选；OKF bundle 必须在不使用 Obsidian 的情况下仍可使用
