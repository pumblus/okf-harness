import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("@okf-harness/cli init", () => {
  it("requires an explicit agent adapter for direct CLI initialization", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--json"],
      {
        writeOut: (chunk) => {
          stdout += chunk;
        },
        writeErr: (chunk) => {
          stderr += chunk;
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      command: "init",
      workspace,
      data: {},
      error: {
        code: "AGENT_TARGET_REQUIRED",
        message:
          "Choose an agent adapter with --agents codex or --agents claude. Use --agents all only if you want both.",
      },
    });
  });

  it("initializes a workspace with the requested Codex adapter", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "AI Research 研究");
    const bin = path.join(root, "bin");
    await mkdir(bin);
    const codex = path.join(bin, process.platform === "win32" ? "codex.CMD" : "codex");
    await writeFile(codex, process.platform === "win32" ? "@echo off\r\n" : "#!/bin/sh\n", "utf8");
    if (process.platform !== "win32") {
      await chmod(codex, 0o755);
    }
    const originalPath = process.env.PATH;
    const originalShell = process.env.SHELL;
    process.env.PATH = bin;
    if (process.platform === "win32") {
      process.env.SHELL = "cmd.exe";
    }
    let stdout = "";
    let stderr = "";

    try {
      const exitCode = await runCli(
        ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "codex", "--json"],
        {
          writeOut: (chunk) => {
            stdout += chunk;
          },
          writeErr: (chunk) => {
            stderr += chunk;
          },
        },
      );

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      const result = JSON.parse(stdout);
      expect(result).toMatchObject({
        ok: true,
        command: "init",
        workspace,
        data: {
          name: "AI Research",
          lint: { ok: true },
          agents: {
            requested: "codex",
          },
          refresh: {
            agentClient: "codex",
            workspacePath: workspace,
            message: expect.stringContaining("Codex"),
            commands: expect.any(Array),
          },
        },
        warnings: [],
      });
      expect(result.data.refresh.commands).toHaveLength(2);
      expect(result.data.refresh.commands[1]).toBe("codex");
      expect(result.data.agents.install.writtenFiles).toEqual(
        expect.arrayContaining([".agents/skills/okf-harness/SKILL.md"]),
      );
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalShell === undefined) {
        delete process.env.SHELL;
      } else {
        process.env.SHELL = originalShell;
      }
    }

    const config = await readFile(path.join(workspace, "okfh.config.yaml"), "utf8");
    expect(config).toContain("name: AI Research");
    expect(config).not.toContain("platform:");
    await expect(readFile(path.join(workspace, "wiki/index.md"), "utf8")).resolves.toContain(
      "# AI Research Wiki",
    );
    await expect(readFile(path.join(workspace, "AGENTS.md"), "utf8")).resolves.toContain(
      "$okf-harness",
    );
    await expect(
      stat(path.join(workspace, ".claude/skills/okf-harness/SKILL.md")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspace, ".git"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await stat(path.join(workspace, "raw/inbox/README.md"))).isFile()).toBe(true);
  });

  it("dry-runs workspace initialization without writing files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      [
        "node",
        "okfh",
        "init",
        workspace,
        "--name",
        "AI Research",
        "--agents",
        "all",
        "--dry-run",
        "--json",
      ],
      {
        writeOut: (chunk) => {
          stdout += chunk;
        },
        writeErr: (chunk) => {
          stderr += chunk;
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      command: "init",
      workspace,
      data: {
        dryRun: true,
        plannedFiles: expect.arrayContaining([
          "okfh.config.yaml",
          "wiki/index.md",
          "CLAUDE.md",
          "AGENTS.md",
          ".claude/skills/okf-harness/SKILL.md",
          ".agents/skills/okf-harness/SKILL.md",
        ]),
      },
      warnings: [],
    });
    await expect(stat(workspace)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("can initialize without agent adapters when explicitly requested", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: (chunk) => {
          stdout += chunk;
        },
        writeErr: (chunk) => {
          stderr += chunk;
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      command: "init",
      workspace,
      data: {
        agents: {
          requested: "none",
        },
      },
      warnings: [],
    });
    await expect(
      stat(path.join(workspace, ".agents/skills/okf-harness-init/SKILL.md")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses to initialize a non-empty workspace without writing agent guidance", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await mkdir(workspace);
    await writeFile(path.join(workspace, "keep.txt"), "do not overwrite\n", "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "codex", "--json"],
      {
        writeOut: (chunk) => {
          stdout += chunk;
        },
        writeErr: (chunk) => {
          stderr += chunk;
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      command: "init",
      workspace,
      data: {},
      error: {
        code: "INIT_NOT_EMPTY",
      },
    });
    await expect(readFile(path.join(workspace, "keep.txt"), "utf8")).resolves.toBe(
      "do not overwrite\n",
    );
    await expect(stat(path.join(workspace, "AGENTS.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      stat(path.join(workspace, ".agents/skills/okf-harness/SKILL.md")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses to initialize a nested workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    let initStdout = "";
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: (chunk) => {
          initStdout += chunk;
        },
        writeErr: () => {},
      },
    );
    expect(JSON.parse(initStdout)).toMatchObject({ ok: true });
    const nestedWorkspace = path.join(workspace, "nested");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["node", "okfh", "init", nestedWorkspace, "--name", "Nested", "--agents", "codex", "--json"],
      {
        writeOut: (chunk) => {
          stdout += chunk;
        },
        writeErr: (chunk) => {
          stderr += chunk;
        },
      },
    );

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      command: "init",
      workspace: nestedWorkspace,
      data: {},
      error: {
        code: "INIT_NESTED_WORKSPACE",
      },
      next: [expect.stringContaining("choose an empty directory outside it")],
    });
    await expect(stat(nestedWorkspace)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns command usage errors as JSON when requested", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "init", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      command: "init",
      data: {},
      error: {
        code: "commander.missingMandatoryOptionValue",
        message: "error: required option '--name <name>' not specified",
      },
    });
  });

  it("optionally initializes git without creating a commit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      [
        "node",
        "okfh",
        "init",
        workspace,
        "--name",
        "AI Research",
        "--agents",
        "none",
        "--git",
        "--json",
      ],
      {
        writeOut: (chunk) => {
          stdout += chunk;
        },
        writeErr: (chunk) => {
          stderr += chunk;
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      command: "init",
      workspace,
      data: {
        git: { initialized: true },
      },
    });
    expect((await stat(path.join(workspace, ".git"))).isDirectory()).toBe(true);
    await expect(stat(path.join(workspace, ".git/COMMIT_EDITMSG"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
