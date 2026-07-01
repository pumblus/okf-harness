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
