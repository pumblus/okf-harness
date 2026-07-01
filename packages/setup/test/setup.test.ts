import { chmod, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSetup } from "../src/index.js";

describe("@okf-harness/setup", () => {
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
    expect(result.stdout).toContain("Warning: git was not found");
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
                dependencies: { "@okf-harness/cli": { version: "0.5.5" } },
              }),
              stderr: "",
            };
          }
          if (command === "okfh" && args.join(" ") === "doctor --json") {
            return {
              stdout: JSON.stringify({ ok: true, data: { checks: [] } }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(runs).toEqual([
      { command: "npm", args: ["ls", "-g", "@okf-harness/cli", "--json", "--depth=0"] },
      { command: "okfh", args: ["doctor", "--json"] },
      { command: "codex", args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"] },
      { command: "codex", args: ["plugin", "add", "okf-harness@okf-harness", "--json"] },
    ]);
    expect(result.stdout).toContain("Native integration summary");
    expect(result.stdout).toContain("Successful integrations: Codex");
    expect(result.stdout).not.toContain("Installing OpenClaw");
    expect(result.stderr).toBe("");
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
                dependencies: { "@okf-harness/cli": { version: "0.5.5" } },
              }),
              stderr: "",
            };
          }
          if (command === "okfh" && args.join(" ") === "doctor --json") {
            return {
              stdout: JSON.stringify({ ok: true, data: { checks: [] } }),
              stderr: "",
            };
          }
          if (
            command === "claude" &&
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
      { command: "npm", args: ["ls", "-g", "@okf-harness/cli", "--json", "--depth=0"] },
      { command: "okfh", args: ["doctor", "--json"] },
      { command: "claude", args: ["plugin", "marketplace", "add", "pumblus/okf-harness"] },
      { command: "codex", args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"] },
      { command: "codex", args: ["plugin", "add", "okf-harness@okf-harness", "--json"] },
    ]);
    expect(result.stdout).toContain("Successful integrations: Codex");
    expect(result.stdout).toContain("Failed integrations");
    expect(result.stdout).toContain(
      "Claude Code failed at claude plugin marketplace add pumblus/okf-harness",
    );
    expect(result.stdout).toContain("Retry commands:");
    expect(result.stdout).toContain("claude plugin marketplace add pumblus/okf-harness");
    expect(result.stdout).toContain("claude plugin install okf-harness@okf-harness");
    expect(result.stderr).toContain("Native integration failed: Claude Code");
    expect(result.stderr).toContain("network unavailable");
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
                dependencies: { "@okf-harness/cli": { version: "0.5.5" } },
              }),
              stderr: "",
            };
          }
          if (command === "okfh" && args.join(" ") === "doctor --json") {
            return {
              stdout: JSON.stringify({ ok: true, data: { checks: [] } }),
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
      command: "openclaw",
      args: ["skills", "install", "@pumblus/okf-harness", "--global"],
    });
    expect(result.stdout).toContain("Successful integrations: OpenClaw");
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
                dependencies: { "@okf-harness/cli": { version: "0.5.5" } },
              }),
              stderr: "",
            };
          }
          if (command === "okfh" && args.join(" ") === "doctor --json") {
            return {
              stdout: JSON.stringify({ ok: true, data: { checks: [] } }),
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

  it("installs a missing global runtime and verifies it with doctor", async () => {
    const runs: Array<{ command: string; args: string[] }> = [];
    const result = await runSetup(
      ["node", "okf-harness-setup", "--runtime-only", "--yes"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          runs.push({ command, args });
          if (command === "npm" && args.join(" ") === "ls -g @okf-harness/cli --json --depth=0") {
            throw Object.assign(new Error("missing"), { code: "ENOENT" });
          }
          if (command === "okfh" && args.join(" ") === "doctor --json") {
            return {
              stdout: JSON.stringify({
                ok: true,
                data: { summary: { fail: 0 }, checks: [] },
                warnings: [],
              }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Runtime: missing");
    expect(result.stdout).toContain("Installing runtime: npm install -g @okf-harness/cli@0.5.5");
    expect(result.stdout).toContain("Runtime verification passed: okfh doctor --json");
    expect(runs).toEqual([
      { command: "npm", args: ["ls", "-g", "@okf-harness/cli", "--json", "--depth=0"] },
      { command: "npm", args: ["install", "-g", "@okf-harness/cli@0.5.5"] },
      { command: "okfh", args: ["doctor", "--json"] },
    ]);
    expect(result.stderr).toBe("");
  });

  it("asks before updating an older global runtime and defaults to yes", async () => {
    const runs: Array<{ command: string; args: string[] }> = [];
    let prompt = "";
    const io = {
      ...captureIo(),
      readLine: async (question: string) => {
        prompt = question;
        return "";
      },
    };

    const result = await runSetup(["node", "okf-harness-setup", "--runtime-only"], io, {
      env: { PATH: "" },
      nodeVersion: "v22.0.0",
      runCommand: async (command, args) => {
        runs.push({ command, args });
        if (command === "npm" && args[0] === "ls") {
          return {
            stdout: JSON.stringify({
              dependencies: { "@okf-harness/cli": { version: "0.5.4" } },
            }),
            stderr: "",
          };
        }
        if (command === "okfh" && args.join(" ") === "doctor --json") {
          return {
            stdout: JSON.stringify({ data: { checks: [] } }),
            stderr: "",
          };
        }
        return { stdout: "", stderr: "" };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Runtime: older; current 0.5.4, target @okf-harness/cli@0.5.5");
    expect(result.stdout).toContain("Runtime update available: current 0.5.4, target 0.5.5.");
    expect(prompt).toBe("Update global okfh runtime? [Y/n] ");
    expect(runs).toEqual([
      { command: "npm", args: ["ls", "-g", "@okf-harness/cli", "--json", "--depth=0"] },
      { command: "npm", args: ["install", "-g", "@okf-harness/cli@0.5.5"] },
      { command: "okfh", args: ["doctor", "--json"] },
    ]);
    expect(result.stderr).toBe("");
  });

  it("does not update an older global runtime when no prompt reader is available", async () => {
    const runs: Array<{ command: string; args: string[] }> = [];
    const result = await runSetup(["node", "okf-harness-setup", "--runtime-only"], captureIo(), {
      env: { PATH: "" },
      nodeVersion: "v22.0.0",
      runCommand: async (command, args) => {
        runs.push({ command, args });
        if (command === "npm" && args[0] === "ls") {
          return {
            stdout: JSON.stringify({
              dependencies: { "@okf-harness/cli": { version: "0.5.4" } },
            }),
            stderr: "",
          };
        }
        return { stdout: "", stderr: "" };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Runtime update skipped.");
    expect(runs).toEqual([
      { command: "npm", args: ["ls", "-g", "@okf-harness/cli", "--json", "--depth=0"] },
    ]);
    expect(result.stderr).toBe("");
  });

  it("reports global runtime permission failures without sudo", async () => {
    const runs: Array<{ command: string; args: string[] }> = [];
    const result = await runSetup(
      ["node", "okf-harness-setup", "--runtime-only", "--yes"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          runs.push({ command, args });
          if (command === "npm" && args[0] === "ls") {
            throw Object.assign(new Error("missing"), { code: "ENOENT" });
          }
          if (command === "npm" && args[0] === "install") {
            throw Object.assign(new Error("EACCES: permission denied, mkdir '/usr/local/lib'"), {
              code: "EACCES",
            });
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Runtime installation failed: npm install -g @okf-harness/cli@0.5.5",
    );
    expect(result.stderr).toContain("Use a user-writable npm global prefix");
    expect(result.stderr).toContain("npm install -g @okf-harness/cli@0.5.5");
    expect(result.stderr).not.toContain("sudo");
    expect(runs).toEqual([
      { command: "npm", args: ["ls", "-g", "@okf-harness/cli", "--json", "--depth=0"] },
      { command: "npm", args: ["install", "-g", "@okf-harness/cli@0.5.5"] },
    ]);
  });

  it("reports workspace doctor warnings without failing setup", async () => {
    const result = await runSetup(
      ["node", "okf-harness-setup", "--runtime-only", "--yes"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.5.5" } },
              }),
              stderr: "",
            };
          }
          if (command === "okfh" && args.join(" ") === "doctor --json") {
            return {
              stdout: JSON.stringify({
                ok: false,
                data: {
                  checks: [
                    {
                      id: "runtime-okfh",
                      status: "pass",
                      message: "runtime ok",
                    },
                    {
                      id: "workspace-status",
                      status: "fail",
                      message: "workspace is not initialized",
                    },
                  ],
                },
              }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Doctor workspace warning: workspace is not initialized");
    expect(result.stdout).toContain("Runtime verification passed: okfh doctor --json");
    expect(result.stderr).toBe("");
  });

  it("reports missing git doctor failures without failing setup", async () => {
    const result = await runSetup(
      ["node", "okf-harness-setup", "--runtime-only", "--yes"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.5.5" } },
              }),
              stderr: "",
            };
          }
          if (command === "okfh" && args.join(" ") === "doctor --json") {
            return {
              stdout: JSON.stringify({
                ok: false,
                data: {
                  checks: [
                    {
                      id: "runtime-git",
                      status: "fail",
                      message: "git executable was not found.",
                    },
                  ],
                },
              }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Doctor setup warning: git executable was not found.");
    expect(result.stdout).toContain("Runtime verification passed: okfh doctor --json");
    expect(result.stderr).toBe("");
  });

  it("fails setup when doctor reports an unclassified failure", async () => {
    const result = await runSetup(
      ["node", "okf-harness-setup", "--runtime-only", "--yes"],
      captureIo(),
      {
        env: { PATH: "" },
        nodeVersion: "v22.0.0",
        runCommand: async (command, args) => {
          if (command === "npm" && args[0] === "ls") {
            return {
              stdout: JSON.stringify({
                dependencies: { "@okf-harness/cli": { version: "0.5.5" } },
              }),
              stderr: "",
            };
          }
          if (command === "okfh" && args.join(" ") === "doctor --json") {
            return {
              stdout: JSON.stringify({ ok: false, data: { checks: [] } }),
              stderr: "",
            };
          }
          return { stdout: "", stderr: "" };
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Runtime verification failed");
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

async function writeFakeExecutable(bin: string, name: string): Promise<void> {
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, name);
  await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(executable, 0o755);
}
