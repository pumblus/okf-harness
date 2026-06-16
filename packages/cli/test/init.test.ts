import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("@okf-harness/cli init", () => {
  it("initializes a Phase 4 workspace with Claude and Codex adapters by default", async () => {
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
          requested: "all",
        },
      },
      warnings: [],
    });
    expect(result.data.agents.install.writtenFiles).toEqual(
      expect.arrayContaining([
        ".claude/skills/okf-harness-init/SKILL.md",
        ".agents/skills/okf-harness-init/SKILL.md",
      ]),
    );

    await expect(readFile(path.join(workspace, "okfh.config.yaml"), "utf8")).resolves.toContain(
      "name: AI Research",
    );
    await expect(readFile(path.join(workspace, "wiki/index.md"), "utf8")).resolves.toContain(
      "# AI Research Wiki",
    );
    await expect(readFile(path.join(workspace, "CLAUDE.md"), "utf8")).resolves.toContain(
      "/okf-harness-init",
    );
    await expect(readFile(path.join(workspace, "AGENTS.md"), "utf8")).resolves.toContain(
      "$okf-harness-init",
    );
    expect((await stat(path.join(workspace, "raw/inbox/README.md"))).isFile()).toBe(true);
  });

  it("dry-runs workspace initialization without writing files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--dry-run", "--json"],
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
          ".claude/skills/okf-harness-init/SKILL.md",
          ".agents/skills/okf-harness-init/SKILL.md",
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

  it("refuses to initialize a non-empty workspace without overwriting files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await mkdir(workspace);
    await writeFile(path.join(workspace, "keep.txt"), "do not overwrite\n", "utf8");
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
      data: {
        code: "INIT_NOT_EMPTY",
      },
    });
    await expect(readFile(path.join(workspace, "keep.txt"), "utf8")).resolves.toBe(
      "do not overwrite\n",
    );
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
      data: {
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
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--git", "--json"],
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
