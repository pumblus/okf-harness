# 安装 OKF Harness Agent Plugin

[English](../AGENT-PLUGIN.md) | 中文

Agent Plugin 是 OKF Harness 原生智能体集成的便携形态：一个符合标准的包——根目录的 `plugin.json` 清单加上统一的 `okf-harness` 宿主级入口技能——任何符合 [Agent Plugins 标准](https://agent-plugins.org/) 的智能体客户端都可以手动安装。包通过运行时启动器运行；Harness CLI 是它委托的运行时——从不属于包本身。

包位于仓库克隆中的 `plugins/agent-plugins/okf-harness/`。由于它位于子目录中，除 Codex 外的每个配方都从克隆或本地路径开始；Codex 保留其 marketplace 命令。

使用 Claude Code、Codex、OpenCode、Pi、Hermes Agent 或 OpenClaw？这些属于 supported agent set——请改用[通用 setup](../../README.zh-CN.md)或 README 中的原生安装表。本页面面向该集合之外的兼容客户端；Codex 也出现在这里，因为它的 marketplace 条目安装的正是这个制品。

## 支持姿态

任何符合 Agent Plugins 标准的智能体客户端都可以手动安装此包。这个声明由两句话界定：

- 兼容客户端位于 supported agent set 之外。它们不获得 [ADR 0044](../adr/0044-use-native-supported-levels-for-v0-6-agent-integrations.md) 下的任何级别，通用 setup 和 doctor 也不会为它们改变。
- 验证义务为零：没有发布检查，也没有周期性配方审计。由于证据并不均衡，下面的每个配方各自带有证据标签——任何测试过某个客户端的人，都可以通过普通 pull request 更新该客户端的标签。

为这些客户端提供通用 setup 安装入口和 doctor 识别仍是[路线图](ROADMAP.md)工作；在此之前，本页面就是成文的手动安装路径。

## 安装配方

### Codex CLI — 已验证

通过 marketplace 条目安装，与原生安装表一致：

```bash
codex plugin marketplace add pumblus/okf-harness --json
codex plugin add okf-harness@okf-harness --json
```

**证据：端到端已验证。** Codex CLI 0.147.0 已针对这个确切制品通过 marketplace 条目完成测试：安装标识保持不变、技能进入模型可见列表、商店界面字段逐字节保留、卸载恢复原状。

### GitHub Copilot CLI — 未测试

先克隆仓库，再按本地路径安装包目录：

```bash
git clone https://github.com/pumblus/okf-harness
copilot plugin install ./okf-harness/plugins/agent-plugins/okf-harness
```

Copilot CLI 也支持直接引用仓库中的子目录：

```bash
copilot plugin install pumblus/okf-harness:plugins/agent-plugins/okf-harness
```

**证据：未测试。** 依据 GitHub 的插件文档编写，未在真实机器上执行过。

### Cursor — 未测试

1. 克隆仓库，或复制包目录。
2. 将包目录——即根目录包含 `plugin.json` 的那个目录——放到 `~/.cursor/plugins/local/okf-harness`。
3. 重启 Cursor，或运行 **Developer: Reload Window**。

Cursor 会从本地插件目录加载 Agent Plugins 包，无需任何修改。

**证据：未测试。** 依据 Cursor 的插件文档编写，未在真实机器上执行过。

### Kiro — 未测试

1. 克隆仓库，或复制包目录。
2. 打开 Powers 面板，选择 **Add Custom Power**。
3. 选择 **Import power from a folder**，选中包目录——即根目录包含 `plugin.json` 的那个目录。

Kiro 也支持用 **Import power from GitHub** 输入包目录 URL `https://github.com/pumblus/okf-harness/tree/main/plugins/agent-plugins/okf-harness`——这是其合作伙伴 power 对子目录中清单的用法。它原生地把 Agent Plugins 包当作 power 读取；包的 `plugin.json` 就是它校验的清单。

**证据：未测试。** 依据 Kiro 的 powers 文档编写，未在真实机器上执行过。

### VS Code — 部分测试

VS Code 中的 GitHub Copilot 扩展读取 Agent Plugins 包。用 `chat.pluginLocations` 设置注册包目录（启用即 `true`）：

```json
"chat.pluginLocations": {
  "/path/to/okf-harness/plugins/agent-plugins/okf-harness": true
}
```

或者用 **Chat: Install Plugin From Source** 从仓库安装，或通过 Copilot CLI 安装——`~/.copilot/installed-plugins/` 下的插件会被自动发现。

**证据：部分测试。** 已在开发机器上安装，但只通过图形化路径使用；设置与命令路径未测试。

### ChatGPT 桌面端 — 未验证

ChatGPT 桌面应用会渲染你已添加 marketplace 的插件商店条目。先用 Codex CLI 添加 marketplace（即 Codex 配方中的两条命令），再从应用的插件目录安装 OKF Harness。商店界面字段来自清单中的 `com.openai` 扩展。

**证据：未验证。** 桌面应用的商店界面是否正确渲染本包的条目，尚未检查。

## 安装之后

入口与原生集成安装的入口相同，都是统一的 `okf-harness` 宿主级入口：它内部路由 setup、check、ingest、对账、回答和图谱请求，并通过启动器运行 Harness 运行时，固定到每个工作区的运行时 pin。让智能体创建工作区、检查它、ingest 来源、对账修订、从 wiki 回答或生成图谱即可。

## 维护

手动安装的包是自我管理的。有三个边界需要了解：

- **Codex 本地路径身份不匹配。** 从裸本地路径而非 marketplace 安装包时，Codex CLI 会警告插件身份不匹配。该警告符合预期且不阻塞——marketplace 路径仍是推荐的安装路径。
- **Doctor 保持沉默。** `okfh doctor` 只探测 supported agent set。它从不报告手动安装的包或加载它的客户端；没有对应条目不是失败，因为 doctor 对 supported agent set 之外的客户端本来就没有可检查的内容。
- **版本自我管理。** 没有任何 OKF Harness 安装器会更新手动安装的包。`plugin.json` 中的版本——以及技能中智能体无需打开清单即可读到的 `okf-harness-version` 元数据——就是智能体用来判断过时的依据：与最新[发布](https://github.com/pumblus/okf-harness/releases)对比即可。修复只覆盖工作区本地指引：智能体通过自我报告确定 `--agents` 目标——Claude Code 和 Codex 映射到对应适配器，其他任何客户端映射到 `--agents none`——对仓库没有为其渲染指引的客户端发起修复请求时，智能体会报告没有可安装的工作区本地指引，然后继续日常工作。没有任何 Harness 命令会重新安装或更新包本身。
