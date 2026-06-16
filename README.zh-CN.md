# OKF Harness

[![CI](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/pumblus/okf-harness/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![macOS](https://img.shields.io/badge/platform-macOS-lightgrey.svg)](docs/zh-CN/ROADMAP.md)

[English](README.md) | 中文

一个 macOS 优先、agent 优先的本地知识管理工具。在 Claude Code、Codex 以及未来的编程 agent 里维护 OKF 兼容的 LLM Wiki，不需要额外安装知识库应用。

OKF Harness 是一个独立开源项目，基于两个上游想法：Andrej Karpathy 的 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 模式，以及 Google 的 [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) / [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)。

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
Claude Code 或 Codex 通过 okfh search/read/graph 查阅
```

装一个 CLI 包，每个知识领域建一个本地 workspace，然后让 Claude Code 或 Codex 帮你添加资料、维护 wiki、回答问题。

## 来源

OKF Harness 建立在：

- [Andrej Karpathy 的 LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)：agent 维护 index、log、互链页面，并执行 ingest、query、lint 的 living wiki 模式。
- Google 的 [Open Knowledge Format 介绍](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) 和 [OKF 规范](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)：用 markdown + frontmatter 表达可移植知识 bundle 的格式。

本仓库与 Andrej Karpathy 或 Google 没有关联，也不代表其背书。

## 快速开始

安装 CLI：

```bash
npm install -g @okf-harness/cli
okfh doctor --json
```

创建第一个 workspace：

```bash
mkdir -p "$HOME/Documents/OKF Harness"
okfh init "$HOME/Documents/OKF Harness/ai-research" --name "AI Research" --agents all --git --json
cd "$HOME/Documents/OKF Harness/ai-research"
```

在 Claude Code 或 Codex 中打开这个文件夹，然后说：

```text
Use OKF Harness to add ~/Downloads/paper.pdf to this workspace, create an ingest plan, and update the wiki with citations.
```

不想全局安装可以先试一下：

```bash
npx --package @okf-harness/cli okfh doctor --json
```

## 为什么选 OKF Harness

大多数个人知识工具以应用为中心。OKF Harness 以本地文件夹为中心：

- 原始资料放在 `raw/sources/` 下，随时可以查看
- 整理后的知识就是 `wiki/` 下的普通 markdown 文件
- 引用标注把主题页面、参考页面和来源 ID 连在一起
- `okfh --json` 给 agent 提供一个确定性的工具接口
- 图谱报告是一个本地 HTML 文件，不依赖任何在线服务

推荐按知识领域、研究方向或隐私边界各建一个 workspace，统一放在 `~/Documents/OKF Harness/` 下，除非你有特别的分离需求。

产品有意保持克制：本地文件、终端原生命令、受控读取和显式溯源优先。GUI、云端同步、Obsidian 辅助、来源连接器、向量检索和跨平台支持等更宽的产品面，只有在不破坏这些保证时才会进入路线图。

## 能做什么

- 在 macOS 上初始化本地 OKF Harness workspace
- 为 workspace 安装 Claude Code 和 Codex 的 agent 指引文件
- 将文件和 URL 指针注册为原始资料
- 生成 ingest plan，让 agent 据此更新 wiki 并添加引用
- 搜索和读取 wiki 页面，输出长度可控
- 检查链接、frontmatter、引用、来源哈希和 manifest 行的完整性
- 生成自包含的本地图谱报告

## 常用工作流

对你的 agent 说：

```text
Set up an OKF Harness workspace for my AI research notes under ~/Documents/OKF Harness. Use the default structure and install Claude and Codex support.
```

```text
Add this source to my AI Research workspace, then update the relevant topic page with citations.
```

```text
What does my AI Research wiki say about LLM Wiki structure? Use OKF Harness search and read before answering.
```

```text
Check this workspace for broken links, missing citations, and source hash drift.
```

开发者也可以直接使用命令行：

```bash
okfh search "LLM Wiki" --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh read topics/llm-wiki --workspace "$HOME/Documents/OKF Harness/ai-research" --json
okfh graph --workspace "$HOME/Documents/OKF Harness/ai-research" --json
```

## 文档

- [工作流](docs/zh-CN/WORKFLOWS.md)：面向用户的 Claude Code 和 Codex 操作流程
- [CLI 参考](docs/zh-CN/CLI.md)：命令、选项和 JSON 行为说明
- [路线图](docs/zh-CN/ROADMAP.md)：当前重点和按需求排序的候选想法
- [示例 workspace](examples/ai-research-workspace/README.md)：一个可通过 lint 检查的小型 workspace
- [参与贡献](docs/zh-CN/CONTRIBUTING.md)：项目范围和验证方式
- [安全策略](docs/zh-CN/SECURITY.md)：本地数据边界和漏洞报告

## 开发

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

项目术语见 [CONTEXT.md](CONTEXT.md)，架构决策见 [docs/adr](docs/adr)。

## 致谢

感谢 Andrej Karpathy 公开 LLM Wiki 模式，也感谢 Google 公开 Open Knowledge Format 这一简洁、可移植的 markdown 知识 bundle 形态。OKF Harness 在此基础上面向本地优先、agent 优先的工作流做了适配。

也感谢 [Tw93 的 Waza](https://github.com/tw93/waza) 和 [Matt Pocock 的 Skills for Real Engineers](https://github.com/mattpocock/skills) 对本项目开发工作流的帮助。

## 许可证

Apache-2.0。详见 [LICENSE](LICENSE)。
