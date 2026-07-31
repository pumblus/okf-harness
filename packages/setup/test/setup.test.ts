import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSetup } from "../src/index.js";
import { makeTempDir as mkdtemp } from "./helpers.js";

describe("@okf-harness/setup", () => {
  it("delegates unchanged runtime arguments to the exact workspace pin", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-launcher-workspace-"));
    await writeWorkspaceConfig(workspace, "Launcher test", "1.2.3");
    await writeFile(path.join(workspace, "untouched.txt"), "unchanged\n", "utf8");
    const before = await snapshotTree(workspace);
    const env = { PATH: "/test/bin", PWD: workspace };
    const runs: Array<{
      command: string;
      args: string[];
      cwd: string | undefined;
      env: NodeJS.ProcessEnv;
      shell: boolean | undefined;
    }> = [];

    const result = await runSetup(
      [
        "node",
        "okf-harness-setup",
        "launch",
        "--workspace",
        workspace,
        "--",
        "status",
        "--json",
        "--limit=2",
      ],
      captureIo(),
      {
        env,
        nodeVersion: "v22.0.0",
        runtimePlatform: "win32",
        runCommand: async (command, args, options) => {
          runs.push({
            command,
            args,
            cwd: options.cwd,
            env: options.env,
            shell: options.shell,
          });
          return { exitCode: 23, stdout: "runtime stdout\n", stderr: "runtime stderr\n" };
        },
      },
    );

    const invocation = {
      command: "npx",
      args: [
        "--loglevel=silent",
        "--yes",
        "--package",
        "@okf-harness/cli@1.2.3",
        "okfh",
        "status",
        "--json",
        "--limit=2",
      ],
    };
    expect(runs).toEqual([{ ...invocation, cwd: workspace, env, shell: false }]);
    expect(result).toEqual({
      exitCode: 23,
      stdout: "runtime stdout\n",
      stderr: "runtime stderr\n",
      outcome: { code: "DELEGATED", workspaceRoot: workspace, invocation },
    });
    expect(await snapshotTree(workspace)).toEqual(before);
  });

  it("reports an exact adoption command without writing a pin-less workspace", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-launcher-pinless-"));
    await writeWorkspaceConfig(workspace, "Pin-less launcher test");
    const before = await snapshotTree(workspace);
    const adoptCommand = {
      command: "npx",
      args: [
        "--yes",
        "--package",
        "@okf-harness/cli@0.6.0",
        "okfh",
        "adopt-runtime",
        "--workspace",
        workspace,
        "--json",
      ],
    };
    let ranCommand = false;

    const result = await runSetup(
      ["node", "okf-harness-setup", "launch", "--workspace", workspace, "--", "status", "--json"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async () => {
          ranCommand = true;
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(ranCommand).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      command: "launch",
      workspace,
      data: { outcome: "RUNTIME_PIN_MISSING", adoptCommand },
      warnings: [],
      error: {
        code: "RUNTIME_PIN_MISSING",
        message: "Workspace runtime pin is missing.",
      },
      next: ["Run data.adoptCommand, then retry launch."],
    });
    expect(result.outcome).toEqual({
      code: "RUNTIME_PIN_MISSING",
      workspaceRoot: workspace,
      adoptCommand,
    });
    expect(await snapshotTree(workspace)).toEqual(before);
  });

  it("distinguishes a malformed runtime pin from execution failure", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-launcher-invalid-"));
    await writeWorkspaceConfig(workspace, "Invalid launcher test", "latest");
    const before = await snapshotTree(workspace);
    let ranCommand = false;

    const result = await runSetup(
      ["node", "okf-harness-setup", "launch", "--workspace", workspace, "--", "status", "--json"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async () => {
          ranCommand = true;
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(ranCommand).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const envelope = JSON.parse(result.stderr);
    expect(envelope).toMatchObject({
      ok: false,
      command: "launch",
      workspace,
      data: { outcome: "CONFIG_INVALID" },
      warnings: [],
      error: { code: "CONFIG_INVALID", message: "Workspace config is invalid." },
      next: [],
    });
    expect(envelope.data.issues).toEqual([
      expect.objectContaining({ code: "CONFIG_INVALID", path: "runtime.version" }),
    ]);
    expect(result.outcome).toMatchObject({
      code: "CONFIG_INVALID",
      workspaceRoot: workspace,
      issues: envelope.data.issues,
    });
    expect(await snapshotTree(workspace)).toEqual(before);
  });

  it("reports when no workspace can be resolved", async () => {
    const startDir = await mkdtemp(path.join(tmpdir(), "okfh-launcher-no-workspace-"));
    const before = await snapshotTree(startDir);
    let ranCommand = false;

    const result = await runSetup(
      ["node", "okf-harness-setup", "launch", "--", "status", "--json"],
      captureIo(),
      {
        env: { PATH: "", PWD: startDir },
        nodeVersion: "v22.0.0",
        runCommand: async () => {
          ranCommand = true;
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(ranCommand).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      command: "launch",
      workspace: null,
      data: { outcome: "WORKSPACE_NOT_FOUND", startDir },
      warnings: [],
      error: {
        code: "WORKSPACE_NOT_FOUND",
        message: "Could not find okfh.config.yaml in the current directory or its parents.",
      },
      next: ["Run from inside an OKF Harness workspace or pass --workspace <path>."],
    });
    expect(result.outcome).toEqual({ code: "WORKSPACE_NOT_FOUND", startDir });
    expect(await snapshotTree(startDir)).toEqual(before);
  });

  it("reports an explicit path without a workspace config as unresolved", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-launcher-missing-workspace-"));
    let ranCommand = false;

    const result = await runSetup(
      ["node", "okf-harness-setup", "launch", "--workspace", workspace, "--", "status"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async () => {
          ranCommand = true;
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(ranCommand).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      workspace: null,
      data: { outcome: "WORKSPACE_NOT_FOUND", startDir: workspace },
      error: { code: "WORKSPACE_NOT_FOUND" },
    });
    expect(result.outcome).toEqual({ code: "WORKSPACE_NOT_FOUND", startDir: workspace });
  });

  it("reports the attempted invocation when the pinned runtime cannot execute", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-launcher-failure-"));
    await writeWorkspaceConfig(workspace, "Launcher failure test", "1.2.3");
    const before = await snapshotTree(workspace);
    const invocation = {
      command: "npx",
      args: [
        "--loglevel=silent",
        "--yes",
        "--package",
        "@okf-harness/cli@1.2.3",
        "okfh",
        "check",
        "--json",
      ],
    };

    const result = await runSetup(
      ["node", "okf-harness-setup", "launch", "--workspace", workspace, "--", "check", "--json"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async () => {
          throw Object.assign(new Error("network unavailable"), {
            code: 1,
            stderr: "npm error network unavailable",
          });
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      command: "launch",
      workspace,
      data: { outcome: "RUNTIME_EXECUTION_FAILED", attemptedInvocation: invocation },
      warnings: [],
      error: {
        code: "RUNTIME_EXECUTION_FAILED",
        message: "Pinned runtime could not be fetched or executed.",
        details: { cause: "network unavailable\nnpm error network unavailable" },
      },
      next: [],
    });
    expect(result.outcome).toEqual({
      code: "RUNTIME_EXECUTION_FAILED",
      workspaceRoot: workspace,
      invocation,
    });
    expect(await snapshotTree(workspace)).toEqual(before);
  });

  it("preserves output and exit code when npx exits after starting", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-launcher-exit-"));
    await writeWorkspaceConfig(workspace, "Launcher exit test", "1.2.3");
    const invocation = {
      command: "npx",
      args: [
        "--loglevel=silent",
        "--yes",
        "--package",
        "@okf-harness/cli@1.2.3",
        "okfh",
        "check",
        "--json",
      ],
    };

    const result = await runSetup(
      ["node", "okf-harness-setup", "launch", "--workspace", workspace, "--", "check", "--json"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async () => {
          throw Object.assign(new Error("Command failed"), {
            code: 42,
            runtimeStarted: true,
            stdout: "delegated stdout\n",
            stderr: "delegated stderr\n",
          });
        },
      },
    );

    expect(result).toEqual({
      exitCode: 42,
      stdout: "delegated stdout\n",
      stderr: "delegated stderr\n",
      outcome: {
        code: "DELEGATED",
        workspaceRoot: workspace,
        invocation,
      },
    });
  });

  it("preserves Windows runtime arguments without a command shell", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-launcher-windows-"));
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-launcher-windows-bin-"));
    await writeWorkspaceConfig(workspace, "Windows launcher test", "1.2.3");
    await writeFakeExecutable(bin, "npx.cmd");
    const npmBin = path.join(bin, "node_modules", "npm", "bin");
    await mkdir(npmBin, { recursive: true });
    await writeFile(
      path.join(npmBin, "npx-cli.js"),
      `const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const commandIndex = args.indexOf("node");
const result = spawnSync(process.execPath, args.slice(commandIndex + 1), { stdio: "inherit" });
process.exit(result.status ?? 1);
`,
      "utf8",
    );
    const packageBin = path.join(bin, "runtime", "node_modules", ".bin");
    const packageRoot = path.join(bin, "runtime", "node_modules", "@okf-harness", "cli");
    await mkdir(packageBin, { recursive: true });
    await mkdir(path.join(packageRoot, "dist"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "@okf-harness/cli",
        version: "1.2.3",
        bin: { okfh: "dist/main.js" },
      }),
      "utf8",
    );
    await writeFile(
      path.join(packageRoot, "dist", "main.js"),
      "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
      "utf8",
    );

    const result = await runSetup(
      [
        "node",
        "okf-harness-setup",
        "launch",
        "--workspace",
        workspace,
        "--",
        "status",
        "value & whoami",
      ],
      captureIo(),
      {
        env: { PATH: [bin, packageBin].join(path.delimiter), PATHEXT: ".CMD" },
        nodeVersion: "v22.0.0",
        runtimePlatform: "win32",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["status", "value & whoami"]);
    expect(result.stderr).toBe("");
    expect(result.outcome?.code).toBe("DELEGATED");
  });

  it("prints a local setup plan with detected choices and install-later guidance", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "codex");
    await writeFakeExecutable(bin, "openclaw");

    const result = await runSetup(["node", "okf-harness-setup", "--dry-run"], captureIo(), {
      env: { PATH: bin },
      nodeVersion: "v22.0.0",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OKF Harness Setup plan");
    expect(result.stdout).toContain("Dry run: no network checks or filesystem writes.");
    expect(result.stdout).toContain("[x] Codex - native-supported - detected - selected");
    expect(result.stdout).toContain("[ ] OpenClaw - native-supported - detected - opt-in");
    expect(result.stdout).toContain("Install later");
    expect(result.stdout).toContain("Claude Code: npx @okf-harness/setup@latest --agents claude");
    expect(result.stdout).toContain("OpenCode: npx @okf-harness/setup@latest --agents opencode");
    expect(result.stdout).toContain("Pi: npx @okf-harness/setup@latest --agents pi");
    expect(result.stdout).toContain("Hermes Agent: npx @okf-harness/setup@latest --agents hermes");
    expect(result.stdout).toContain("Warning: workspace recovery dependency is unavailable");
    expect(result.stderr).toBe("");
  });

  it("rejects Node.js below 22 without package-manager-specific install commands", async () => {
    const result = await runSetup(["node", "okf-harness-setup", "--dry-run"], captureIo(), {
      env: { PATH: "" },
      nodeVersion: "v20.19.0",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Node.js 22 or newer");
    expect(result.stderr).toContain("https://nodejs.org");
    expect(result.stderr).not.toMatch(/\b(?:brew|apt|yum|dnf|nvm|npm|pnpm|yarn)\b/);
    expect(result.stdout).toBe("");
  });

  it("keeps remote verification explicit and separate from dry-run", async () => {
    const dryRun = await runSetup(["node", "okf-harness-setup", "--dry-run"], captureIo(), {
      env: { PATH: "" },
      nodeVersion: "v22.0.0",
    });
    expect(dryRun.stdout).toContain("Remote checks: not requested.");

    const verifyRemote = await runSetup(
      ["node", "okf-harness-setup", "--dry-run", "--verify-remote"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
      },
    );
    expect(verifyRemote.stdout).toContain("Remote checks: requested with --verify-remote");
  });

  it("does not write filesystem state during dry-run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-setup-home-"));
    const home = path.join(root, "home");

    const result = await runSetup(["node", "okf-harness-setup", "--dry-run"], captureIo(), {
      env: { HOME: home, PATH: "", USERPROFILE: home },
      nodeVersion: "v22.0.0",
    });

    expect(result.exitCode).toBe(0);
    await expect(stat(home)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not select OpenClaw unless it is named explicitly", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "openclaw");

    const auto = await runSetup(
      ["node", "okf-harness-setup", "--agents", "auto", "--yes", "--dry-run"],
      captureIo(),
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
      },
    );
    expect(auto.stdout).toContain("[ ] OpenClaw - native-supported - detected - opt-in");

    const explicit = await runSetup(
      ["node", "okf-harness-setup", "--agents", "openclaw", "--yes", "--dry-run"],
      captureIo(),
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
      },
    );
    expect(explicit.stdout).toContain("[x] OpenClaw - native-supported - detected - selected");
  });

  it("installs auto-selected native integrations without OpenClaw", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "codex");
    await writeFakeExecutable(bin, "openclaw");
    const runs: Array<{ command: string; args: string[] }> = [];

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "auto", "--yes"],
      captureIo(),
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          runs.push({ command, args });
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.6.0" } },
              }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(runs).toEqual([
      {
        command: "npm",
        args: ["ls", "-g", "@pumblus/okf-harness", "--json", "--depth=0"],
      },
      {
        command: path.join(bin, "codex"),
        args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"],
      },
      {
        command: path.join(bin, "codex"),
        args: ["plugin", "add", "okf-harness@okf-harness", "--json"],
      },
    ]);
    expect(result.stdout).toContain("Install results");
    expect(result.stdout).toContain("Install commands completed without errors: Codex");
    expect(result.stdout).toContain(
      "State verification: not performed; command success does not confirm integration state.",
    );
    expect(result.stdout).not.toContain("Post-install verification");
    expect(result.stdout).not.toContain("Successful integrations");
    expect(result.stdout).not.toContain("Installing OpenClaw");
    expect(result.stderr).toBe("");
  });

  it("runs native installs through the detected Windows command shim", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "codex.cmd");
    const runs: Array<{
      args: string[];
      command: string;
      cwd: string | undefined;
      shell: boolean | undefined;
    }> = [];

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "codex", "--yes"],
      captureIo(),
      {
        env: { PATH: bin, PATHEXT: ".CMD" },
        nodeVersion: "v22.0.0",
        runtimePlatform: "win32",
        runCommand: async (command, args, options) => {
          runs.push({ args, command, cwd: options.cwd, shell: options.shell });
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.6.0" } },
              }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(runs).toContainEqual({
      args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"],
      command: "codex.cmd",
      cwd: bin,
      shell: true,
    });
    expect(runs).toContainEqual({
      args: ["plugin", "add", "okf-harness@okf-harness", "--json"],
      command: "codex.cmd",
      cwd: bin,
      shell: true,
    });
  });

  it("continues native integration installation after one agent fails", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "claude");
    await writeFakeExecutable(bin, "codex");
    const runs: Array<{ command: string; args: string[] }> = [];

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "claude,codex", "--yes"],
      captureIo(),
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          runs.push({ command, args });
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.6.0" } },
              }),
              stderr: "",
            };
          }
          if (
            command === path.join(bin, "claude") &&
            args.join(" ") === "plugin marketplace add pumblus/okf-harness"
          ) {
            throw Object.assign(new Error("marketplace failed"), { stderr: "network unavailable" });
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(runs).toEqual([
      {
        command: "npm",
        args: ["ls", "-g", "@pumblus/okf-harness", "--json", "--depth=0"],
      },
      {
        command: path.join(bin, "claude"),
        args: ["plugin", "marketplace", "add", "pumblus/okf-harness"],
      },
      {
        command: path.join(bin, "codex"),
        args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"],
      },
      {
        command: path.join(bin, "codex"),
        args: ["plugin", "add", "okf-harness@okf-harness", "--json"],
      },
    ]);
    expect(result.stdout).toContain("Install commands completed without errors: Codex");
    expect(result.stdout).toContain("Failed integrations");
    expect(result.stdout).toContain(
      "Claude Code failed at claude plugin marketplace add pumblus/okf-harness",
    );
    expect(result.stdout).toContain("Retry from failed command:");
    expect(result.stdout).toContain("claude plugin marketplace add pumblus/okf-harness");
    expect(result.stdout).toContain("claude plugin install okf-harness@okf-harness");
    expect(result.stderr).toContain("Native integration failed: Claude Code");
    expect(result.stderr).toContain("network unavailable");
  });

  it("reports partial native integration state when a later command fails", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "claude");

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "claude", "--yes"],
      captureIo(),
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.6.0" } },
              }),
              stderr: "",
            };
          }
          if (
            command === path.join(bin, "claude") &&
            args.join(" ") === "plugin install okf-harness@okf-harness"
          ) {
            throw new Error("install failed");
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Completed before failure:");
    expect(result.stdout).toContain("claude plugin marketplace add pumblus/okf-harness");
    expect(result.stdout).toContain("Retry from failed command:");
    expect(result.stdout).toContain("claude plugin install okf-harness@okf-harness");
  });

  it("installs explicitly selected Hermes through the custom skill tap", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "hermes");
    const runs: Array<{ command: string; args: string[] }> = [];

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "hermes", "--yes"],
      captureIo(),
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          runs.push({ command, args });
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.6.0" } },
              }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(runs).toContainEqual({
      command: path.join(bin, "hermes"),
      args: ["skills", "tap", "add", "pumblus/okf-harness"],
    });
    expect(runs).toContainEqual({
      command: path.join(bin, "hermes"),
      args: ["skills", "install", "pumblus/okf-harness/okf-harness"],
    });
    expect(result.stdout).toContain("Install commands completed without errors: Hermes Agent");
  });

  it("installs explicitly selected OpenClaw with --yes", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "openclaw");
    const runs: Array<{ command: string; args: string[] }> = [];
    let prompted = false;

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "openclaw", "--yes"],
      {
        ...captureIo(),
        readLine: async () => {
          prompted = true;
          return "n";
        },
      },
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          runs.push({ command, args });
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.6.0" } },
              }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(prompted).toBe(false);
    expect(runs).toContainEqual({
      command: path.join(bin, "openclaw"),
      args: ["skills", "install", "@pumblus/okf-harness", "--global"],
    });
    expect(result.stdout).toContain("Install commands completed without errors: OpenClaw");
  });

  it("shows an extra OpenClaw safety note before interactive native install", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-bin-"));
    await writeFakeExecutable(bin, "openclaw");
    let prompt = "";

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "openclaw"],
      {
        ...captureIo(),
        readLine: async (question: string) => {
          prompt = question;
          return "y";
        },
      },
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.6.0" } },
              }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OpenClaw safety note:");
    expect(prompt).toBe("Install selected native integrations? [Y/n] ");
  });

  it("renders shadowing global installs as removals without changing them in dry-run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-setup-shadow-bin-"));
    const localBin = path.join(root, "node_modules", ".bin");
    const globalBin = path.join(root, "global-bin");
    await writeFakeExecutable(localBin, "okfh");
    await writeFakeExecutable(globalBin, "okfh");
    const runs: Array<{ command: string; args: string[] }> = [];

    const result = await runSetup(["node", "okf-harness-setup", "--dry-run"], captureIo(), {
      env: { PATH: [localBin, globalBin].join(path.delimiter) },
      nodeVersion: "v22.0.0",
      runCommand: async (command, args) => {
        runs.push({ command, args });
        return {
          stdout: JSON.stringify({
            dependencies: { "@pumblus/okf-harness": { version: "0.5.4" } },
          }),
          stderr: "",
        };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Removals");
    expect(result.stdout).toContain(`Global okfh runtime: ${path.join(globalBin, "okfh")}`);
    expect(result.stdout).toContain("Global bootstrap package");
    expect(result.stdout).toContain("npm uninstall -g @okf-harness/cli @pumblus/okf-harness");
    expect(runs).toEqual([
      {
        command: "npm",
        args: ["ls", "-g", "@pumblus/okf-harness", "--json", "--depth=0"],
      },
    ]);
    await expect(stat(path.join(globalBin, "okfh"))).resolves.toBeDefined();
  });

  it("clears shadowing installs with one command and still installs native integrations", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-shadow-bin-"));
    const okfh = path.join(bin, "okfh");
    await writeFakeExecutable(bin, "okfh");
    await writeFakeExecutable(bin, "codex");
    let bootstrapInstalled = true;
    const runs: Array<{ command: string; args: string[] }> = [];

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "codex", "--yes"],
      captureIo(),
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          runs.push({ command, args });
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: bootstrapInstalled
                  ? { "@pumblus/okf-harness": { version: "0.5.4" } }
                  : {},
              }),
              stderr: "",
            };
          }
          if (command === "npm" && args[0] === "uninstall") {
            bootstrapInstalled = false;
            await rm(okfh);
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(runs).toEqual([
      {
        command: "npm",
        args: ["ls", "-g", "@pumblus/okf-harness", "--json", "--depth=0"],
      },
      {
        command: "npm",
        args: ["uninstall", "-g", "@okf-harness/cli", "@pumblus/okf-harness"],
      },
      {
        command: "npm",
        args: ["ls", "-g", "@pumblus/okf-harness", "--json", "--depth=0"],
      },
      {
        command: path.join(bin, "codex"),
        args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"],
      },
      {
        command: path.join(bin, "codex"),
        args: ["plugin", "add", "okf-harness@okf-harness", "--json"],
      },
    ]);
    expect(result.stdout).toContain("Shadowing global install cleanup verified.");
    expect(result.stdout).toContain("Install commands completed without errors: Codex");
    expect(result.stdout).not.toContain("npm install -g");
    expect(result.stdout).not.toContain("okfh doctor");
    expect(result.stderr).toBe("");
  });

  it("continues native installation and reports residual risk when cleanup is declined", async () => {
    const bin = await mkdtemp(path.join(tmpdir(), "okfh-setup-shadow-bin-"));
    await writeFakeExecutable(bin, "okfh");
    await writeFakeExecutable(bin, "codex");
    const prompts: string[] = [];
    const runs: Array<{ command: string; args: string[] }> = [];

    const result = await runSetup(
      ["node", "okf-harness-setup", "--agents", "codex"],
      {
        ...captureIo(),
        readLine: async (prompt) => {
          prompts.push(prompt);
          return prompts.length === 1 ? "n" : "y";
        },
      },
      {
        env: { PATH: bin },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          runs.push({ command, args });
          return { stdout: JSON.stringify({ dependencies: {} }), stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(prompts).toEqual([
      "Remove shadowing global installs? [Y/n] ",
      "Install selected native integrations? [Y/n] ",
    ]);
    expect(runs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: expect.arrayContaining(["uninstall"]) }),
      ]),
    );
    expect(runs).toEqual(
      expect.arrayContaining([expect.objectContaining({ command: path.join(bin, "codex") })]),
    );
    expect(result.stdout).toContain("Shadowing global install removal skipped.");
    expect(result.stdout).toContain("Shadowing global installs remaining:");
    expect(result.stdout).toContain("Global okfh runtime");
    expect(result.stdout).toContain(
      "Clear with: npm uninstall -g @okf-harness/cli @pumblus/okf-harness",
    );
    expect(result.stdout).toContain("Install commands completed without errors: Codex");
    expect(result.stderr).toBe("");
  });
});

function captureIo(): {
  writeOut: (chunk: string) => void;
  writeErr: (chunk: string) => void;
  stdout: string;
  stderr: string;
} {
  const io = {
    stdout: "",
    stderr: "",
    writeOut(chunk: string) {
      io.stdout += chunk;
    },
    writeErr(chunk: string) {
      io.stderr += chunk;
    },
  };
  return io;
}

async function writeWorkspaceConfig(
  workspace: string,
  name: string,
  runtimeVersion?: string,
): Promise<void> {
  const runtime = runtimeVersion === undefined ? "" : `runtime:\n  version: "${runtimeVersion}"\n`;
  await writeFile(
    path.join(workspace, "okfh.config.yaml"),
    `version: "0.1"
workspace:
  name: ${name}
  created_at: "2026-01-01T00:00:00.000Z"
${runtime}okf:
  bundle_root: wiki
  profile: default
paths:
  raw_inbox: raw/inbox
  raw_sources: raw/sources
  wiki_root: wiki
  manifest: raw/manifest.jsonl
safety:
  raw_sources_immutable: true
  max_files_changed_per_ingest: 50
`,
    "utf8",
  );
}

async function snapshotTree(root: string, current: string = root): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      Object.assign(snapshot, await snapshotTree(root, entryPath));
    } else if (entry.isFile()) {
      snapshot[path.relative(root, entryPath)] = await readFile(entryPath, "utf8");
    }
  }
  return snapshot;
}

async function writeFakeExecutable(bin: string, name: string): Promise<void> {
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, name);
  await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(executable, 0o755);
}
