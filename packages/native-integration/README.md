# OKF Harness Native Integration

This package exposes the global `okf-harness-bootstrap` integration for Pi, OpenCode, and OpenClaw.

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

The package does not install or update the OKF Harness runtime. If `okfh` is missing, run Universal setup:

```bash
npx @okf-harness/setup@latest
```

## Scope

The native package only exposes `okf-harness-bootstrap`. Daily workspace-local OKF Harness skills remain installed by the runtime when a workspace supports that agent adapter.
