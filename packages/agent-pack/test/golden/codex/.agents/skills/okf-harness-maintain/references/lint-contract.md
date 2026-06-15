# Lint Contract

## Supported now

Run:

```bash
okfh lint --workspace <workspace> --json
```

Fix only issues that can be resolved from current wiki context without inventing missing source facts.

## Future maintenance commands

Source hash checks are supported by `okfh lint`. Graph generation is a later-phase capability; if `okfh graph` is unavailable, stop and say the installed OKF Harness version does not implement graph generation yet.
