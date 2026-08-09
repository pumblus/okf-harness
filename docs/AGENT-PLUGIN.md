# Install the OKF Harness Agent Plugin

English | [中文](zh-CN/AGENT-PLUGIN.md)

The Agent Plugin is the portable form of the OKF Harness native agent integration: one standards-conforming package — a `plugin.json` manifest plus the unified `okf-harness` host-level entrypoint skill — that any agent client conforming to the [Agent Plugins standard](https://agent-plugins.org/) can install by hand. The package invokes the runtime launcher, and the Harness CLI is the runtime it delegates to — never part of the package.

The package ships at `plugins/agent-plugins/okf-harness/` inside a clone of the [repository](https://github.com/pumblus/okf-harness). Because it sits in a subdirectory, every recipe below except Codex's starts from a clone or a local path; Codex keeps its marketplace command.

On Claude Code, Codex, OpenCode, Pi, Hermes Agent, or OpenClaw? Those are the supported agent set — use [universal setup](../README.md) or the native install table in the README instead. This page is for compatible clients outside that set; Codex appears here too, because its marketplace entry installs exactly this artifact.

## Support posture

Any agent client conforming to the Agent Plugins standard can install this package by hand. Two statements bound that claim:

- Compatible clients are outside the supported agent set. They carry no level under [ADR 0044](adr/0044-use-native-supported-levels-for-v0-6-agent-integrations.md), and universal setup and doctor do not change for them.
- Verification obligation is zero: no release check and no recurring recipe audit. Each recipe below carries its own evidence label, because the evidence is uneven — and anyone who tests a client updates that client's status line by ordinary pull request.

Universal setup install offers and doctor recognition for these clients remain [roadmap](ROADMAP.md) work; this page is the documented manual path until that lands.

## Install recipes

### Codex CLI — verified

Installs through the marketplace entry, unchanged from the native install table:

```bash
codex plugin marketplace add pumblus/okf-harness --json
codex plugin add okf-harness@okf-harness --json
```

**Evidence: verified end to end.** Codex CLI 0.147.0 was tested against this exact artifact through the marketplace entry: the install identifier held, the skill reached the model-visible list, the storefront fields survived byte for byte, and removal restored the environment.

### GitHub Copilot CLI — untested

Clone the repository, then install the package directory by local path:

```bash
git clone https://github.com/pumblus/okf-harness
copilot plugin install ./okf-harness/plugins/agent-plugins/okf-harness
```

Copilot CLI also accepts the repository's subdirectory directly:

```bash
copilot plugin install pumblus/okf-harness:plugins/agent-plugins/okf-harness
```

**Evidence: untested.** Written from GitHub's plugin documentation; not exercised on a machine.

### Cursor — untested

1. Clone the repository, or copy the package directory.
2. Place the package directory — the one with `plugin.json` at its root — at `~/.cursor/plugins/local/okf-harness`.
3. Restart Cursor, or run **Developer: Reload Window**.

Cursor loads Agent Plugins packages from its local plugins directory without changes.

**Evidence: untested.** Written from Cursor's plugin documentation; not exercised on a machine.

### Kiro — untested

1. Clone the repository, or copy the package directory.
2. Open the Powers panel and choose **Add Custom Power**.
3. Choose **Import power from a folder** and select the package directory — the one with `plugin.json` at its root.

Kiro also accepts **Import power from GitHub** with the package directory URL `https://github.com/pumblus/okf-harness/tree/main/plugins/agent-plugins/okf-harness`, the pattern its partner powers use for manifests in subdirectories. It reads Agent Plugins packages natively as powers; the package's `plugin.json` is the manifest it validates.

**Evidence: untested.** Written from Kiro's powers documentation; not exercised on a machine.

### VS Code — partially tested

The GitHub Copilot extension in VS Code reads Agent Plugins packages. Register the package directory with the `chat.pluginLocations` setting (enable means `true`):

```json
"chat.pluginLocations": {
  "/path/to/okf-harness/plugins/agent-plugins/okf-harness": true
}
```

Alternatively, install from the repository with **Chat: Install Plugin From Source**, or install with Copilot CLI — plugins under `~/.copilot/installed-plugins/` are discovered automatically.

**Evidence: partially tested.** Installed on the development machine, but exercised only through a graphical path; the settings and command paths are untested.

### ChatGPT desktop — unverified

The ChatGPT desktop app renders plugin storefront entries from marketplaces you have added. Add the marketplace with Codex CLI (the two commands in the Codex recipe), then install OKF Harness from the app's plugin directory. The storefront fields come from the `com.openai` extension in the manifest.

**Evidence: unverified.** Whether the desktop app's storefront renders this package's entry correctly has not been checked.

## After installing

The entrypoint is the same unified `okf-harness` host-level entrypoint a native agent integration installs: it routes setup, check, ingest, reconciliation, answer, and graph requests, and runs the Harness runtime through the launcher, pinned to each workspace's runtime pin. Ask the agent to set up a workspace, check it, ingest sources, reconcile revisions, answer from the wiki, or graph it.

## Maintenance

A hand-installed package is self-managed. Three boundaries to know:

- **Codex local-path identity mismatch.** Installing the package from a bare local path instead of the marketplace makes Codex CLI warn that the plugin's identity does not match. The warning is expected and non-blocking — the marketplace path stays the recommended install path.
- **Doctor silence.** `okfh doctor` probes the supported agent set only. It never reports on a hand-installed package or the client that loads it; an absent entry is not a failure, because doctor has nothing to check for a client outside the supported agent set.
- **Self-managed versions.** No OKF Harness installer ever updates a hand-installed package. The version in `plugin.json` — and the skill's `okf-harness-version` metadata, which an agent reads without opening the manifest — is what an agent inspects to judge staleness: compare it with the latest [release](https://github.com/pumblus/okf-harness/releases). Repair covers workspace-local guidance only: the agent determines the `--agents` target by self-report — Claude Code and Codex map to those adapters, any other client maps to `--agents none` — and a repair request on a client the repository does not render guidance for reports that there is no workspace-local guidance to install, then continues with daily work. No Harness command reinstalls or updates the package itself.
