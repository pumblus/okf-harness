import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("installer scripts", () => {
  it("delegates macOS/Linux setup to @okf-harness/setup@latest with argument pass-through", async () => {
    const bash = await findCommand("bash");
    if (bash === undefined) {
      return;
    }

    const fixture = await createInstallerFixture();
    const result = await run(
      bash,
      [path.join(repoRoot, "install.sh"), "--dry-run", "--agents", "codex"],
      {
        env: {
          ...process.env,
          OKFH_ARGS_FILE: fixture.argsFile,
          OKFH_FAKE_NODE_MAJOR: "22",
          PATH: fixture.bin,
        },
      },
    );

    expect(result.code).toBe(0);
    expect(await readArgs(fixture.argsFile)).toEqual([
      "--yes",
      "@okf-harness/setup@latest",
      "--dry-run",
      "--agents",
      "codex",
    ]);
  });

  it("rejects missing or old Node.js on macOS/Linux without package-manager install advice", async () => {
    const bash = await findCommand("bash");
    if (bash === undefined) {
      return;
    }

    const fixture = await createInstallerFixture();
    const result = await run(bash, [path.join(repoRoot, "install.sh"), "--dry-run"], {
      env: {
        ...process.env,
        OKFH_FAKE_NODE_MAJOR: "20",
        PATH: fixture.bin,
      },
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Node.js 22 or newer");
    expect(result.stderr).toContain("https://nodejs.org");
    expect(result.stderr).not.toMatch(/\b(?:brew|apt|yum|dnf|nvm|winget|choco|scoop)\b/i);
  });

  it("delegates Windows setup to @okf-harness/setup@latest with argument pass-through", async () => {
    const powershell = await findCommand("pwsh");
    if (powershell === undefined) {
      return;
    }

    const fixture = await createInstallerFixture();
    const result = await run(
      powershell,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(repoRoot, "install.ps1"),
        "--dry-run",
        "--agents",
        "codex",
      ],
      {
        env: {
          ...process.env,
          OKFH_ARGS_FILE: fixture.argsFile,
          OKFH_FAKE_NODE_MAJOR: "22",
          PATH: fixture.bin,
          Path: fixture.bin,
        },
      },
    );

    expect(result.code).toBe(0);
    expect(await readArgs(fixture.argsFile)).toEqual([
      "--yes",
      "@okf-harness/setup@latest",
      "--dry-run",
      "--agents",
      "codex",
    ]);
  });

  it("rejects old Node.js on Windows without package-manager install advice", async () => {
    const powershell = await findCommand("pwsh");
    if (powershell === undefined) {
      return;
    }

    const fixture = await createInstallerFixture();
    const result = await run(
      powershell,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(repoRoot, "install.ps1"),
        "--dry-run",
      ],
      {
        env: {
          ...process.env,
          OKFH_FAKE_NODE_MAJOR: "20",
          PATH: fixture.bin,
          Path: fixture.bin,
        },
      },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Node.js 22 or newer");
    expect(result.stderr).toContain("https://nodejs.org");
    expect(result.stderr).not.toMatch(/\b(?:brew|apt|yum|dnf|nvm|winget|choco|scoop)\b/i);
  });

  it("keeps installer scripts as thin setup launchers", async () => {
    const scripts = [
      await readFile(path.join(repoRoot, "install.sh"), "utf8"),
      await readFile(path.join(repoRoot, "install.ps1"), "utf8"),
    ];

    for (const script of scripts) {
      expect(script).toContain("@okf-harness/setup@latest");
      expect(script).not.toMatch(
        /\bokfh\b|workspace|bootstrap|plugin|codex|claude|opencode|hermes|openclaw/i,
      );
    }
  });
});

async function createInstallerFixture(): Promise<{ argsFile: string; bin: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "okfh-installer-"));
  const bin = path.join(root, "bin");
  const argsFile = path.join(root, "args.txt");
  await mkdir(bin, { recursive: true });
  await writeExecutable(
    path.join(bin, "node"),
    [
      "#!/bin/sh",
      'major="$OKFH_FAKE_NODE_MAJOR"',
      'if [ -z "$major" ]; then major="22"; fi',
      'if [ "$1" = "-e" ]; then',
      '  if [ "$major" -ge 22 ]; then exit 0; fi',
      "  exit 1",
      "fi",
      'if [ "$1" = "-p" ]; then',
      '  printf "%s.0.0\\n" "$major"',
      "  exit 0",
      "fi",
      'printf "v%s.0.0\\n" "$major"',
      "",
    ].join("\n"),
  );
  await writeExecutable(
    path.join(bin, "npx"),
    [
      "#!/bin/sh",
      ': > "$OKFH_ARGS_FILE"',
      'for arg in "$@"; do',
      '  printf "%s\\n" "$arg" >> "$OKFH_ARGS_FILE"',
      "done",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(bin, "node.cmd"),
    [
      "@echo off",
      'if "%1"=="-e" (',
      '  if "%OKFH_FAKE_NODE_MAJOR%"=="20" exit /b 1',
      '  if "%OKFH_FAKE_NODE_MAJOR%"=="21" exit /b 1',
      "  exit /b 0",
      ")",
      'if "%1"=="-p" (',
      "  echo %OKFH_FAKE_NODE_MAJOR%.0.0",
      "  exit /b 0",
      ")",
      "echo v%OKFH_FAKE_NODE_MAJOR%.0.0",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  await writeFile(
    path.join(bin, "npx.cmd"),
    [
      "@echo off",
      'break > "%OKFH_ARGS_FILE%"',
      ":loop",
      'if "%~1"=="" goto done',
      'echo %~1>> "%OKFH_ARGS_FILE%"',
      "shift",
      "goto loop",
      ":done",
      "exit /b 0",
      "",
    ].join("\r\n"),
    "utf8",
  );
  return { argsFile, bin };
}

async function writeExecutable(file: string, contents: string): Promise<void> {
  await writeFile(file, contents, "utf8");
  await chmod(file, 0o755);
}

async function findCommand(command: string): Promise<string | undefined> {
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const candidates =
    process.platform === "win32" ? [command, `${command}.cmd`, `${command}.exe`] : [command];
  for (const entry of pathEntries) {
    for (const candidate of candidates) {
      const fullPath = path.join(entry, candidate);
      const result = await run(fullPath, ["--version"], { env: process.env });
      if (result.code === 0) {
        return fullPath;
      }
    }
  }
  return undefined;
}

async function readArgs(file: string): Promise<string[]> {
  const contents = await readFile(file, "utf8");
  return contents.split(/\r?\n/).filter(Boolean);
}

function run(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv },
): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ code: 1, stderr: error.message, stdout });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}
