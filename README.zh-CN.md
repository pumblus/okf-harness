# OKF Harness

[![CI](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![本地终端](https://img.shields.io/badge/platform-local%20terminal-lightgrey.svg)](docs/zh-CN/CLI.md)

[English](README.md) | 中文

一个以智能体优先、本地优先、终端原生的工具，用来维护兼容 OKF 的 LLM Wiki。

OKF Harness 是一个独立开源项目，基于两个上游想法：Andrej Karpathy 的 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式（智能体维护的活 Wiki），以及 Google 的 [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)（可移植的 markdown 知识包）。

```text
源文件或 URL
        |
        v
raw/sources + .okfh/manifest.jsonl
        |
        v
wiki/*.md（含引用标注）
        |
        v
受支持智能体通过 okfh evidence/read/graph 查阅
```

OKF Harness 不用你学新的知识库应用。你只需要为正在使用的智能体跑一次设置，每个知识领域建一个本地工作区，然后让受支持的智能体添加资料、维护 wiki，并从中回答问题。

## 来源

OKF Harness 建立在以下基础之上：

- Andrej Karpathy 的 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)：一种由智能体维护的 Wiki 模式，包含索引、日志、链接页面、摄取、查询和检查功能。
- Google 的 [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) 和 [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)：用 Markdown 和 frontmatter 表达可移植知识包（bundle）的格式。

本仓库与 Andrej Karpathy 或 Google 没有关联，也不代表其背书。

## 开始之前

如果你是 macOS 或 Linux 用户，运行这个脚本：

```bash
curl -fsSL https://okf-harness.dev/install.sh | sh
```

Windows PowerShell 运行这个：

```powershell
irm https://okf-harness.dev/install.ps1 | iex
```

已经有 Node.js 22 或更高版本？

```bash
npx @okf-harness/setup@latest
```

普通使用需要 Node.js 22 或更高版本、git、共享的 `okfh` 运行时，以及至少一个受支持的智能体集成。只有参与仓库开发时才额外需要 `pnpm`。

安装程序会在确认后安装或更新共享的全局 `okfh` 运行时，检测受支持的智能体客户端，并安装选中的原生集成。对于已经了解自己智能体的用户，可以直接使用原生安装路径：

| 智能体 | 原生安装命令 |
|---|---|
| Claude Code | `claude plugin marketplace add pumblus/okf-harness && claude plugin install okf-harness@okf-harness` |
| Codex | `codex plugin marketplace add pumblus/okf-harness --json && codex plugin add okf-harness@okf-harness --json` |
| OpenCode | `opencode plugin @pumblus/okf-harness --global` |
| Pi | `pi install npm:@pumblus/okf-harness` |
| Hermes Agent | `hermes skills tap add pumblus/okf-harness && hermes skills install pumblus/okf-harness/okf-harness` |
| OpenClaw | `openclaw skills install @pumblus/okf-harness --global` |

直接安装 CLI 运行时属于高级 CLI-only 路径，见 CLI 文档。它不会写入智能体引导入口。

setup 后，普通首次启动流程是先在当前智能体里调用全局引导入口。若该智能体支持工作区本地指引，引导完成后会告诉你如何刷新到工作区里的 `okf-harness` 入口。

推荐父目录只是一个约定，不是 CLI 隐式默认路径。macOS 或 Linux 使用 `$HOME/Documents/OKF Harness`。Windows PowerShell 使用 `$env:USERPROFILE\Documents\OKF Harness`。Command Prompt 使用 `%USERPROFILE%\Documents\OKF Harness`。

## 从你的智能体开始

使用当前智能体暴露的 OKF Harness 入口名。入口名是固定的，调用语法由智能体决定：Codex 通常用 `$okf-harness`，Claude Code 通常用 `/okf-harness`，其他原生集成通过各自的 skill 或 plugin 入口暴露同名能力。

复制下面的提示词时，把尖括号里的入口替换成当前智能体的实际调用方式。

```text
<okf-harness-bootstrap> 在我的 Documents 文件夹中为我的 AI 研究笔记设置一个工作区，然后告诉我如何刷新当前智能体上下文。
```

完成设置或选择工作区后，在工作区内使用工作区本地入口：

```text
<okf-harness> 检查这个工作区，并告诉我它是否已经就绪。
```

全局引导入口也可以从本地工作区集合（Workspace collection）中发现或选择工作区，并为选中的工作区修复当前智能体设置（Current-agent setup）。它不会整理 Wiki 内容、迁移非空的非工作区目录，也不会写入全局根指引文件。

临时诊断可以使用：

```bash
npx --package @okf-harness/cli okfh doctor --json
```

这不会添加全局 `okfh` 命令。

## 常见下一步

添加资料：

```text
<okf-harness> 将这个 PDF 添加到我的工作区，更新 Wiki 并加上引用，然后再次检查工作区。
```

提问：

```text
<okf-harness> 我的工作区里是如何描述 LLM Wiki 结构的？
```

## 为什么选 OKF Harness

大多数个人知识工具以应用为中心。OKF Harness 以本地文件夹为中心：

- 原始资料放在 `raw/sources/` 下，随时可以查看
- 整理后的知识就是 `wiki/` 下的普通 Markdown 文件
- 引用标注把主题页面、参考页面和来源 ID 连在一起
- `okfh --json` 给智能体提供一个确定性的工具接口
- 图谱报告是一个本地 HTML 文件，不依赖任何在线服务

推荐按知识领域、研究方向或隐私边界各建一个工作区，统一放在本机的 `Documents/OKF Harness/` 目录下，除非你有特别的分离需求。

产品有意保持克制：本地文件、终端原生命令、受控证据、受控读取和显式溯源优先。图形界面（GUI）、云端同步、Obsidian 辅助、来源连接器和向量检索等更宽的产品面，只有在不破坏这些保证时才会进入路线图。

## 能做什么

- 初始化本地 OKF Harness 工作区
- 为有工作区适配器的智能体安装受支持的工作区指引
- 将文件和 URL 指针注册为原始资料
- 生成整理计划（Ingest plan），让智能体据此更新 Wiki 并添加引用
- 回答前从已整理的 Wiki 页面准备长度受控的证据摘要（Evidence Brief）
- 搜索和读取 Wiki 页面，用于调试检索和受控续读
- 检查 OKF 合规状态和 Harness lint 发现
- 生成自包含的本地图谱报告

## 背后发生什么

智能体会通过本地 shell 运行 `okfh --json`。例如：

- 首次设置会通过全局引导入口解析工作区集合、确认写入、调用 `okfh init` 并传入当前智能体的适配器（Adapter），然后返回智能体上下文刷新（Agent context refresh）指引
- ingest 调用 `okfh source add` 和 `okfh ingest plan`
- 回答问题时使用 `okfh evidence`，只有需要跟随续读提示时才再执行一次受控的 `okfh read`
- 验证工作区时使用 `okfh check`
- 图谱报告使用 `okfh graph`

开发者也可以直接使用命令行：

```bash
okfh check --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh evidence "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read topics/llm-wiki --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

## 排查问题

如果 `okf-harness-bootstrap` 入口缺失、版本漂移，或被同名非受管理技能（Skill）阻挡，运行：

```bash
okfh doctor --json
```

`doctor` 会分别报告运行时、原生集成、旧式引导 fallback 和工作区检查。`okfh bootstrap status|repair --agents codex|claude|all --json` 只用于 Claude/Codex 适配器的高级旧式 fallback 修复；主要的首次设置流程是 setup 加上上面的智能体提示词。

## 文档

- [工作流](docs/zh-CN/WORKFLOWS.md)：面向用户的智能体操作流程，也包含首次启动检查
- [CLI 参考](docs/zh-CN/CLI.md)：命令、选项和 JSON 行为说明
- [路线图](docs/zh-CN/ROADMAP.md)：当前重点和按需求排序的候选想法
- [示例工作区](examples/ai-research-workspace/README.md)：一个可通过 check 检查的小型工作区
- [参与贡献](docs/zh-CN/CONTRIBUTING.md)：项目范围和验证方式
- [安全策略](docs/zh-CN/SECURITY.md)：本地数据边界和漏洞报告

## 开发

```bash
pnpm install
pnpm docs:llms
pnpm test
pnpm typecheck
pnpm build
```

项目术语见 [CONTEXT.md](CONTEXT.md)，架构决策见 [docs/adr](docs/adr)。

## 致谢

感谢 Andrej Karpathy 公开 LLM Wiki 模式，也感谢 Google 公开 Open Knowledge Format 这一简洁、可移植的 Markdown 知识 bundle 形态。OKF Harness 在此基础上面向本地优先、智能体优先的工作流做了适配。

也感谢 Tw93 的 [Waza](https://github.com/tw93/waza) 和 Matt Pocock 的 [Skills for Real Engineers](https://github.com/mattpocock/skills) 对本项目开发的帮助。

## 许可证

Apache-2.0。详见 [LICENSE](LICENSE)。
