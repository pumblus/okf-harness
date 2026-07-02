#!/usr/bin/env sh
set -eu

node_requirement="OKF Harness setup requires Node.js 22 or newer. Download Node.js from https://nodejs.org."

if ! command -v node >/dev/null 2>&1; then
  echo "$node_requirement" >&2
  exit 1
fi

if ! node -e 'const major = Number.parseInt(process.versions.node.split(".")[0], 10); process.exit(Number.isFinite(major) && major >= 22 ? 0 : 1);' >/dev/null 2>&1; then
  echo "$node_requirement" >&2
  exit 1
fi

exec npx --yes @okf-harness/setup@latest "$@"
