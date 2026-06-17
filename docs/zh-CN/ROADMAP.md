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

- 回答基于已整理的 `wiki/` 内容，而非跨原始资料的全文发现
- 没有 `okfh query` 或 LLM 回答命令，agent 通过组合 `search` 和 `read` 来回答问题
- 搜索结果返回候选概念文档，不是答案证据
- 读取默认受控，并提供显式续读选项
- 图谱展示概念链接和证据链接，原始资料文件保留为元数据而非图谱节点
- GUI、云端同步、用户账户、向量搜索、RAG、自动网页抓取和 Obsidian 运行时代码，会留在需求分层里，直到它们能保留本地化、可检查的工作流

## 高需求

### 受控证据查询规划

目标：让 agent 回答可靠且不超出上下文窗口。

候选范围：

- `okfh query plan <question> --json` 或等价的证据包命令
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
- Obsidian 友好的辅助工具或插件

约束：

- 任何集成都不能替代默认的终端原生 `okfh --json` 工作流
- Obsidian 保持可选；OKF bundle 必须在不使用 Obsidian 的情况下仍可使用
