import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  commandErrorDetails,
  commandExitCode,
  commandStderr,
  commandStdout,
  detectGlobalPackageVersion,
  detectShadowingGlobalInstalls,
  executableExistsOnPath,
  findExecutable,
  type NativeInstallCommand,
  nodeErrorCode,
  type ProbeRunner,
  probeCommands,
  shouldUseWindowsShell,
  windowsShellInvocation,
} from "../src/index.js";

async function fakeBin(files: Record<string, string>): Promise<string> {
  const bin = await mkdtemp(path.join(tmpdir(), "okfh-probe-bin-"));
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(bin, name), contents, "utf8");
    await chmod(path.join(bin, name), 0o755);
  }
  return bin;
}

describe("findExecutable", () => {
  it("finds the bare command on PATH", async () => {
    const bin = await fakeBin({ claude: "#!/bin/sh\nexit 0\n" });
    await expect(findExecutable("claude", { PATH: bin })).resolves.toBe(path.join(bin, "claude"));
  });

  it("returns undefined when the command is not on PATH", async () => {
    const bin = await fakeBin({ claude: "#!/bin/sh\nexit 0\n" });
    await expect(findExecutable("codex", { PATH: bin })).resolves.toBeUndefined();
  });

  it("returns undefined for an empty or missing PATH", async () => {
    await expect(findExecutable("claude", {})).resolves.toBeUndefined();
    await expect(findExecutable("claude", { PATH: "" })).resolves.toBeUndefined();
  });

  it("prefers the first PATH directory that matches", async () => {
    const first = await fakeBin({ claude: "#!/bin/sh\nexit 0\n" });
    const second = await fakeBin({ claude: "#!/bin/sh\nexit 0\n" });
    await expect(
      findExecutable("claude", { PATH: `${first}${path.delimiter}${second}` }),
    ).resolves.toBe(path.join(first, "claude"));
  });

  it.skipIf(process.platform === "win32")("skips non-executable files", async () => {
    const bin = await fakeBin({ claude: "not executable\n" });
    await chmod(path.join(bin, "claude"), 0o644);
    await expect(findExecutable("claude", { PATH: bin })).resolves.toBeUndefined();
  });

  it("skips directories", async () => {
    const bin = await fakeBin({});
    await mkdir(path.join(bin, "codex"));
    await expect(findExecutable("codex", { PATH: bin })).resolves.toBeUndefined();
  });

  it("finds PATHEXT variants on any platform", async () => {
    const bin = await fakeBin({ "codex.cmd": "@exit /b 0\r\n" });
    await expect(findExecutable("codex", { PATH: bin, PATHEXT: ".CMD" })).resolves.toBe(
      path.join(bin, "codex.cmd"),
    );
  });

  it("checks the bare command before PATHEXT variants", async () => {
    const bin = await fakeBin({ codex: "#!/bin/sh\nexit 0\n", "codex.cmd": "@exit /b 0\r\n" });
    await expect(findExecutable("codex", { PATH: bin, PATHEXT: ".CMD" })).resolves.toBe(
      path.join(bin, "codex"),
    );
  });

  it("finds uppercase PATHEXT variants", async () => {
    const bin = await fakeBin({ "codex.CMD": "@exit /b 0\r\n" });
    const found = await findExecutable("codex", { PATH: bin, PATHEXT: ".CMD" });
    // Case-insensitive filesystems resolve the lowercase variant first.
    expect(found?.toLowerCase()).toBe(path.join(bin, "codex.cmd").toLowerCase());
  });

  it("applies the accept filter before returning a match", async () => {
    const bin = await fakeBin({ okfh: "#!/bin/sh\nexit 0\n" });
    await expect(findExecutable("okfh", { PATH: bin }, () => false)).resolves.toBeUndefined();
    await expect(
      findExecutable("okfh", { PATH: bin }, (executablePath) => executablePath.endsWith("okfh")),
    ).resolves.toBe(path.join(bin, "okfh"));
  });
});

describe("executableExistsOnPath", () => {
  it("resolves true for a present executable", async () => {
    const bin = await fakeBin({ codex: "#!/bin/sh\nexit 0\n" });
    await expect(
      executableExistsOnPath("codex", {
        env: { PATH: bin },
        runtimePlatform: process.platform,
      }),
    ).resolves.toBe(true);
  });

  it("resolves false for a missing executable", async () => {
    const bin = await fakeBin({ codex: "#!/bin/sh\nexit 0\n" });
    await expect(
      executableExistsOnPath("claude", {
        env: { PATH: bin },
        runtimePlatform: process.platform,
      }),
    ).resolves.toBe(false);
  });

  it("splits PATH with the platform delimiter and finds PATHEXT variants on win32", async () => {
    const bin = await fakeBin({ "codex.CMD": "@exit /b 0\r\n" });
    await expect(
      executableExistsOnPath("codex", {
        env: { PATH: `${bin};C:\\other`, PATHEXT: ".CMD" },
        runtimePlatform: "win32",
      }),
    ).resolves.toBe(true);
  });
});

describe("probeCommands", () => {
  const commands: NativeInstallCommand[] = [
    { command: "claude", args: ["plugin", "list", "--json"] },
  ];

  it("shapes successful runs as stdout with exitCode 0", async () => {
    const run: ProbeRunner = async () => ({ stdout: "[]", stderr: "" });
    await expect(
      probeCommands(commands, run, {
        env: {},
        invocation: (command) => ({ command, shell: false }),
      }),
    ).resolves.toEqual([{ stdout: "[]", exitCode: 0 }]);
  });

  it("honors an exit code reported by the runner", async () => {
    const run: ProbeRunner = async () => ({ stdout: "", stderr: "", exitCode: 7 });
    await expect(
      probeCommands(commands, run, {
        env: {},
        invocation: (command) => ({ command, shell: false }),
      }),
    ).resolves.toEqual([{ stdout: "", exitCode: 7 }]);
  });

  it("stops at the first nonzero exit code", async () => {
    const runs: string[] = [];
    const run: ProbeRunner = async (command) => {
      runs.push(command);
      return { stdout: "", stderr: "", exitCode: 3 };
    };
    const multi: NativeInstallCommand[] = [
      { command: "claude", args: [] },
      { command: "codex", args: [] },
    ];
    await expect(
      probeCommands(multi, run, { env: {}, invocation: (command) => ({ command, shell: false }) }),
    ).resolves.toEqual([{ stdout: "", exitCode: 3 }]);
    expect(runs).toEqual(["claude"]);
  });

  it("stops and records the captured exit code when a probe throws", async () => {
    const run: ProbeRunner = async () => {
      throw Object.assign(new Error("probe failed"), { code: 12, stdout: "partial" });
    };
    await expect(
      probeCommands(commands, run, {
        env: {},
        invocation: (command) => ({ command, shell: false }),
      }),
    ).resolves.toEqual([{ stdout: "", exitCode: 12 }]);
  });

  it("records a probe without an exit code when a thrown error has none", async () => {
    const run: ProbeRunner = async () => {
      throw new Error("probe failed");
    };
    await expect(
      probeCommands(commands, run, {
        env: {},
        invocation: (command) => ({ command, shell: false }),
      }),
    ).resolves.toEqual([{ stdout: "" }]);
  });

  it("applies the invocation and forwards env, cwd, and shell to the runner", async () => {
    let seen: { command: string; args: string[]; options: Record<string, unknown> } | undefined;
    const run: ProbeRunner = async (command, args, options) => {
      seen = { command, args, options: { ...options } };
      return { stdout: "[]", stderr: "" };
    };
    const env = { PATH: "/bin" };
    await probeCommands(commands, run, {
      env,
      invocation: () => ({ command: "claude.cmd", cwd: "C:\\tools", shell: true }),
    });
    expect(seen).toEqual({
      command: "claude.cmd",
      args: ["plugin", "list", "--json"],
      options: { cwd: "C:\\tools", env, shell: true },
    });
  });

  it("notifies onProbe before each command", async () => {
    const run: ProbeRunner = async () => ({ stdout: "", stderr: "" });
    const probed: string[] = [];
    const multi: NativeInstallCommand[] = [
      { command: "claude", args: [] },
      { command: "codex", args: [] },
    ];
    await probeCommands(multi, run, {
      env: {},
      invocation: (command) => ({ command, shell: false }),
      onProbe: (command) => probed.push(command.command),
    });
    expect(probed).toEqual(["claude", "codex"]);
  });
});

describe("shouldUseWindowsShell", () => {
  it("allows the shared allowlist on win32", () => {
    for (const executable of ["git", "npm", "okfh", "pnpm"]) {
      expect(shouldUseWindowsShell("win32", executable)).toBe(true);
    }
  });

  it("rejects executables outside the allowlist on win32", () => {
    for (const executable of ["claude", "codex", "opencode", "hermes"]) {
      expect(shouldUseWindowsShell("win32", executable)).toBe(false);
    }
  });

  it("never uses a shell off win32", () => {
    for (const executable of ["git", "npm", "okfh", "pnpm"]) {
      expect(shouldUseWindowsShell("darwin", executable)).toBe(false);
      expect(shouldUseWindowsShell("linux", executable)).toBe(false);
    }
  });
});

describe("windowsShellInvocation", () => {
  it("runs resolved executables directly off win32", () => {
    expect(windowsShellInvocation("claude", "/usr/local/bin/claude", "darwin")).toEqual({
      command: "/usr/local/bin/claude",
      shell: false,
    });
  });

  it("runs a .cmd file through a shell from its own directory on win32", () => {
    expect(windowsShellInvocation("claude", "C:\\tools\\claude.cmd", "win32")).toEqual({
      command: "claude.cmd",
      cwd: "C:\\tools",
      shell: true,
    });
  });

  it("runs a .bat file through a shell from its own directory on win32", () => {
    expect(windowsShellInvocation("git", "C:\\tools\\git.bat", "win32")).toEqual({
      command: "git.bat",
      cwd: "C:\\tools",
      shell: true,
    });
  });

  it("runs non-batch executables by resolved path on win32", () => {
    expect(windowsShellInvocation("codex", "C:\\tools\\codex.exe", "win32")).toEqual({
      command: "C:\\tools\\codex.exe",
      shell: false,
    });
  });

  it("falls back to the bare command without a resolved path", () => {
    expect(windowsShellInvocation("claude", undefined, "win32")).toEqual({
      command: "claude",
      shell: false,
    });
  });
});

describe("detectGlobalPackageVersion", () => {
  const options = {
    env: { PATH: "/bin" },
    runtimePlatform: "darwin",
  };

  it("parses the version from a successful npm ls", async () => {
    const run: ProbeRunner = async () => ({
      stdout: JSON.stringify({ dependencies: { "@pumblus/okf-harness": { version: "0.6.0" } } }),
      stderr: "",
    });
    await expect(
      detectGlobalPackageVersion("@pumblus/okf-harness", { ...options, runCommand: run }),
    ).resolves.toBe("0.6.0");
  });

  it("parses the version from a thrown error's stdout", async () => {
    const run: ProbeRunner = async () => {
      throw Object.assign(new Error("npm failed"), {
        stdout: JSON.stringify({ dependencies: { "@pumblus/okf-harness": { version: "0.6.0" } } }),
      });
    };
    await expect(
      detectGlobalPackageVersion("@pumblus/okf-harness", { ...options, runCommand: run }),
    ).resolves.toBe("0.6.0");
  });

  it("returns undefined when the package is absent", async () => {
    const run: ProbeRunner = async () => ({
      stdout: JSON.stringify({ dependencies: {} }),
      stderr: "",
    });
    await expect(
      detectGlobalPackageVersion("@pumblus/okf-harness", { ...options, runCommand: run }),
    ).resolves.toBeUndefined();
  });
});

describe("detectShadowingGlobalInstalls", () => {
  it("reports nothing when no shadowing install exists", async () => {
    const bin = await fakeBin({});
    const run: ProbeRunner = async () => ({
      stdout: JSON.stringify({ dependencies: {} }),
      stderr: "",
    });
    await expect(
      detectShadowingGlobalInstalls({
        env: { PATH: bin },
        runCommand: run,
        runtimePlatform: "darwin",
      }),
    ).resolves.toEqual([]);
  });

  it("reports a global runtime executable on PATH", async () => {
    const bin = await fakeBin({ okfh: "#!/bin/sh\nexit 0\n" });
    const run: ProbeRunner = async () => ({
      stdout: JSON.stringify({ dependencies: {} }),
      stderr: "",
    });
    await expect(
      detectShadowingGlobalInstalls({
        env: { PATH: bin },
        runCommand: run,
        runtimePlatform: "darwin",
      }),
    ).resolves.toEqual([
      {
        id: "runtime",
        label: "Global okfh runtime",
        executablePath: path.join(bin, "okfh"),
      },
    ]);
  });

  it("reports a globally installed bootstrap package", async () => {
    const bin = await fakeBin({});
    const run: ProbeRunner = async () => ({
      stdout: JSON.stringify({
        dependencies: { "@pumblus/okf-harness": { version: "0.6.0" } },
      }),
      stderr: "",
    });
    await expect(
      detectShadowingGlobalInstalls({
        env: { PATH: bin },
        runCommand: run,
        runtimePlatform: "darwin",
      }),
    ).resolves.toEqual([
      {
        id: "bootstrap",
        label: "Global bootstrap package",
        packageName: "@pumblus/okf-harness",
        version: "0.6.0",
      },
    ]);
  });
});

describe("command error readers", () => {
  it("prefers the exitCode field over the numeric code field", () => {
    const error = Object.assign(new Error("failed"), { exitCode: 5, code: 9 });
    expect(commandExitCode(error)).toBe(5);
    const codeOnly = Object.assign(new Error("failed"), { code: 9 });
    expect(commandExitCode(codeOnly)).toBe(9);
    expect(commandExitCode(new Error("failed"))).toBeUndefined();
    expect(commandExitCode("failed")).toBeUndefined();
  });

  it("reads stdout and stderr from thrown errors", () => {
    const error = Object.assign(new Error("failed"), { stdout: "out", stderr: "err" });
    expect(commandStdout(error)).toBe("out");
    expect(commandStderr(error)).toBe("err");
    expect(commandStdout(new Error("failed"))).toBe("");
    expect(commandStderr("failed")).toBe("");
  });

  it("composes error details from message and captured output", () => {
    const error = Object.assign(new Error("failed"), { stdout: "out", stderr: "err" });
    expect(commandErrorDetails(error)).toBe("failed\nout\nerr");
    expect(commandErrorDetails(new Error("plain"))).toBe("plain");
    expect(commandErrorDetails("raw")).toBe("raw");
  });

  it("reads string error codes", () => {
    const error = Object.assign(new Error("missing"), { code: "ENOENT" });
    expect(nodeErrorCode(error)).toBe("ENOENT");
    expect(nodeErrorCode(Object.assign(new Error("failed"), { code: 9 }))).toBeUndefined();
    expect(nodeErrorCode("missing")).toBeUndefined();
  });
});
