# OKF Harness Native Integration

This package exposes the unified `okf-harness` host entrypoint for Pi, OpenCode, and OpenClaw.

## Install

```bash
pi install npm:@pumblus/okf-harness
```

```bash
opencode plugin @pumblus/okf-harness --global
```

```bash
openclaw skills install @pumblus/okf-harness --global
```

The entrypoint invokes the version-independent launcher, which resolves each workspace's pinned Harness runtime on demand. Nothing is installed globally.

## Scope

The host entrypoint handles workspace setup and daily maintenance. This package does not install workspace-local adapters for Pi, OpenCode, or OpenClaw.
