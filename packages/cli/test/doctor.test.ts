import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type RunExecutable, runDoctor } from "../src/doctor/index.js";
import { runCli } from "../src/index.js";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli doctor", () => {
  let restoreEnv: (() => void) | undefined;
  let fakeEnv: { claudeHome: string; codexStateDirectory: string };

  beforeEach(async () => {
    const env = await useFakeDoctorEnv();
    restoreEnv = env.restore;
    fakeEnv = env.paths;
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it("checks CLI dependencies and installed adapters for an initialized workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      [
        "node",
        "okfh",
        "init",
        workspace,
        "--name",
        "AI Research",
        "--agents",
        "all",
        "--git",
        "--json",
      ],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    await mkdir(path.join(workspace, ".git"), { recursive: true });
    await mkdir(fakeEnv.codexStateDirectory, { recursive: true });
    await mkdir(fakeEnv.claudeHome, { recursive: true });
    await runJsonCli(["node", "okfh", "bootstrap", "install", "--agents", "all", "--json"]);

    const result = await runJsonCli(["node", "okfh", "doctor", "--workspace", workspace, "--json"]);

    expect(result).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "doctor",
        workspace,
        data: {
          summary: {
            fail: 0,
          },
          checks: expect.arrayContaining([
            expect.objectContaining({ id: "runtime-okfh", status: "pass" }),
            expect.objectContaining({ id: "runtime-platform", status: "pass" }),
            expect.objectContaining({ id: "runtime-node", status: "pass" }),
            expect.objectContaining({ id: "runtime-git", status: "pass" }),
            expect.objectContaining({ id: "global-bootstrap-codex", status: "pass" }),
            expect.objectContaining({ id: "global-bootstrap-claude", status: "pass" }),
            expect.objectContaining({ id: "workspace-status", status: "pass" }),
            expect.objectContaining({ id: "workspace-adapter-claude", status: "pass" }),
            expect.objectContaining({ id: "workspace-adapter-codex", status: "pass" }),
          ]),
        },
        warnings: [],
        next: [expect.stringContaining("okfh --json")],
      },
    });
  });

  it("warns but succeeds when no workspace can be resolved", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      const result = await runJsonCli(["node", "okfh", "doctor", "--json"]);

      expect(result).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "doctor",
          workspace: null,
          data: {
            checks: expect.arrayContaining([
              expect.objectContaining({ id: "workspace-resolution", status: "warn" }),
              expect.objectContaining({ id: "global-bootstrap-codex", status: "skip" }),
              expect.objectContaining({ id: "global-bootstrap-claude", status: "skip" }),
              expect.objectContaining({ id: "workspace-status", status: "skip" }),
            ]),
          },
          warnings: [
            expect.objectContaining({
              code: "WORKSPACE_RESOLUTION",
            }),
          ],
        },
      });
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("keeps reporting when a global bootstrap status cannot be read", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    process.env.CODEX_HOME = path.join(root, "x".repeat(10_000));

    const result = await runDoctor({ startDir: root });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "global-bootstrap-codex",
          status: "warn",
          message: expect.stringContaining("could not be read"),
        }),
      ]),
    );
  });

  it("does not require pnpm in default runtime doctor mode", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const runExecutable: RunExecutable = async (executable) => {
      if (executable === "pnpm") {
        throw Object.assign(new Error("spawn pnpm ENOENT"), { code: "ENOENT" });
      }
      return { stdout: `${executable} version\n`, stderr: "" };
    };

    const result = await runDoctor({
      startDir: root,
      runExecutable,
    });

    expect(result.ok).toBe(true);
    expect(result.checks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "runtime-pnpm", status: "fail" })]),
    );
  });

  it("requires pnpm in dev doctor mode", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const runExecutable: RunExecutable = async (executable) => {
      if (executable === "pnpm") {
        throw Object.assign(new Error("spawn pnpm ENOENT"), { code: "ENOENT" });
      }
      return { stdout: `${executable} version\n`, stderr: "" };
    };

    const result = await runDoctor({
      startDir: root,
      dev: true,
      runExecutable,
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "runtime-pnpm", status: "fail" })]),
    );
  });

  it("exposes pnpm as a dev-mode doctor check", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const previousCwd = process.cwd();
    process.chdir(root);
    try {
      const result = await runJsonCli(["node", "okfh", "doctor", "--dev", "--json"]);

      expect(result).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "doctor",
          data: {
            checks: expect.arrayContaining([
              expect.objectContaining({ id: "runtime-pnpm", status: "pass" }),
            ]),
          },
        },
      });
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("warns when checkpoint policy is enabled outside a Git work tree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );

    const result = await runJsonCli(["node", "okfh", "doctor", "--workspace", workspace, "--json"]);

    expect(result).toMatchObject({
      exitCode: 0,
      result: {
        ok: true,
        data: {
          checks: expect.arrayContaining([
            expect.objectContaining({ id: "workspace-safety-policy", status: "warn" }),
          ]),
        },
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: "WORKSPACE_SAFETY_POLICY",
          }),
        ]),
      },
    });
  });

  it("checks Windows npm shims through a controlled shell path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const runs: Array<{ executable: string; shell: boolean }> = [];
    const runExecutable: RunExecutable = async (executable, _args, options) => {
      runs.push({ executable, shell: options.shell === true });
      if (executable === "pnpm" && options.shell !== true) {
        throw Object.assign(new Error("spawn pnpm ENOENT"), { code: "ENOENT" });
      }
      return {
        stdout: executable === "pnpm" ? "11.0.6\n" : `${executable} version\n`,
        stderr: "",
      };
    };

    const result = await runDoctor({
      startDir: root,
      dev: true,
      runtimePlatform: "win32",
      runExecutable,
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "runtime-platform", status: "pass" }),
        expect.objectContaining({ id: "runtime-pnpm", status: "pass" }),
      ]),
    );
    expect(runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ executable: "git", shell: false }),
        expect.objectContaining({ executable: "pnpm", shell: true }),
      ]),
    );
  });

  it("fails when an explicit workspace is not initialized", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);

    const result = await runJsonCli(["node", "okfh", "doctor", "--workspace", workspace, "--json"]);

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: "",
      result: {
        ok: false,
        command: "doctor",
        workspace,
        data: {
          summary: {
            fail: 1,
          },
          checks: expect.arrayContaining([
            expect.objectContaining({ id: "workspace-status", status: "fail" }),
          ]),
        },
      },
    });
  });

  it("renders failed checks in human doctor output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "doctor", "--workspace", workspace], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toBe("");
    expect(stdout).toContain("Doctor:");
    expect(stdout).toContain("FAIL Workspace status:");
  });
});

async function useFakeDoctorEnv(): Promise<{
  paths: { claudeHome: string; codexStateDirectory: string };
  restore: () => void;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "okfh-doctor-env-"));
  const bin = path.join(root, "bin");
  const home = path.join(root, "home");
  const codexStateDirectory = path.join(root, ".codex");
  const claudeHome = path.join(root, ".claude");
  await mkdir(bin, { recursive: true });
  await writeExecutable(
    path.join(bin, "git"),
    '#!/bin/sh\nif [ "$1" = "init" ]; then mkdir -p .git; exit 0; fi\nif [ "$1" = "--version" ]; then echo "git version 2.50.0"; exit 0; fi\nexit 0\n',
  );
  await writeExecutable(path.join(bin, "pnpm"), "#!/bin/sh\necho 11.0.6\n");

  const keys = ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "HOME", "PATH", "USERPROFILE"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<
    (typeof keys)[number],
    string | undefined
  >;
  process.env.CLAUDE_CONFIG_DIR = claudeHome;
  process.env.CODEX_HOME = codexStateDirectory;
  process.env.HOME = home;
  process.env.PATH = bin;
  delete process.env.USERPROFILE;

  return {
    paths: { claudeHome, codexStateDirectory },
    restore: () => {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

async function writeExecutable(filePath: string, contents: string): Promise<void> {
  await writeFile(filePath, contents, "utf8");
  await chmod(filePath, 0o755);
}
