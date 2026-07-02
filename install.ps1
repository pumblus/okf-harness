$ErrorActionPreference = "Stop"

$nodeRequirement = "OKF Harness setup requires Node.js 22 or newer. Download Node.js from https://nodejs.org."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error $nodeRequirement
  exit 1
}

try {
  $nodeVersion = & node -p "process.versions.node"
} catch {
  Write-Error $nodeRequirement
  exit 1
}

$nodeMajor = 0
$nodeMajorText = ($nodeVersion -split "\.")[0]
if (-not [int]::TryParse($nodeMajorText, [ref] $nodeMajor) -or $nodeMajor -lt 22) {
  Write-Error $nodeRequirement
  exit 1
}

& npx --yes @okf-harness/setup@latest @args
exit $LASTEXITCODE
