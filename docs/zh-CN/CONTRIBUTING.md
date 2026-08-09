# 参与 OKF Harness 贡献

感谢你花时间改进 OKF Harness。项目目前还很小，最好的贡献是范围窄、可测试、且与当前本地 agent 优先方向一致的改动。

[English](../../CONTRIBUTING.md) | 中文

请使用 GitHub issue templates 提交 bug report、feature discussion，或协调安全报告。

## 范围

适合起步的贡献：

- 文档修正和更清晰的示例
- 针对现有 CLI 或核心行为的专项测试
- `okfh --json` 命令行为的 bug 修复
- CLI 错误信息和下一步提示的改进
- 受支持智能体的指引、原生集成或适配器修正
- 小型示例 workspace 的改进

以下方向请先开 issue 或发起讨论：

- 新的 agent 适配器
- Obsidian 辅助工具
- GUI 或桌面应用
- 云端同步、账户或后台守护进程
- 向量搜索、embedding 或 RAG
- 网页抓取、来源连接器或自动爬取

绕过路线图讨论、直接提交云端账户、后台爬取、自动修改原始资料、替代默认工具通道或非 JSON agent 契约的 PR，将被关闭或引导调整方向。

中文翻译帮助同样欢迎，但英文 PR 也可以直接接受，不要求贡献者额外维护中文版本。

## 本地开发环境

环境要求：

- macOS、Windows 或 Linux
- Node.js 22 或更高版本
- pnpm 11

安装并验证：

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

构建后运行本地 CLI：

```bash
node packages/cli/dist/main.js doctor --json
```

## 开发规则

- 运行时改动限制在当前阶段或已接受的 issue 范围内。
- 保持 `@okf-harness/core` 独立于 CLI、agent-pack 和其他上层包。
- 保持 `@okf-harness/cli` 作为 core 和 agent-pack 行为之间的桥梁。
- 遵循 [docs/agents/guardrails.md](../../docs/agents/guardrails.md) 中的护栏。

## 测试

用最小的验证方式证明你的改动有效。智能体的完整验证循环见 [docs/agents/verify.md](../../docs/agents/verify.md)：

```bash
pnpm test
pnpm typecheck
pnpm lint
```

`pnpm lint`（Biome 加 llms 文档新鲜度检查）在 PR 前必须通过；CI 在每个 PR 上都会运行它。

涉及 CLI 行为变化时，还需构建并运行构建后的二进制：

```bash
pnpm build
node packages/cli/dist/main.js check --workspace <workspace> --json
```

涉及 workspace 或 wiki 的改动，对相应 workspace 运行同样的 `okfh check` 检查。

发布跟进前，还需运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:tarball
```

## 文档

README 应面向用户、篇幅简短。命令参考放在 [docs/CLI.md](CLI.md)，用户工作流放在 [docs/WORKFLOWS.md](WORKFLOWS.md)，产品路线图想法放在 [docs/ROADMAP.md](ROADMAP.md)，仅限网站的路线图想法放在 [docs/zh-CN/website/ROADMAP.md](website/ROADMAP.md)，术语放在 [CONTEXT.md](../../CONTEXT.md)，架构决策放在 [docs/adr](../adr)。

文档应优先解释普通受支持智能体用户该怎么操作，然后再说明内部包结构。

## Pull Request 清单

提交 PR 之前：

- 运行相关测试
- 对用户可见的行为变化更新文档
- 遵循 [docs/agents/guardrails.md](../../docs/agents/guardrails.md) 中的护栏
- 避免无关的格式化变动
- 注明你无法运行的检查项
