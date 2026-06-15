import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("@okf-harness/cli", () => {
  it("initializes a Phase 2 workspace and reports the result as JSON", async () => {
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
      },
      warnings: [expect.objectContaining({ code: "AGENT_PACK_PENDING" })],
    });
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: "MCP_PENDING" }));

    await expect(readFile(path.join(workspace, "okfh.config.yaml"), "utf8")).resolves.toContain(
      "name: AI Research",
    );
    await expect(readFile(path.join(workspace, "wiki/index.md"), "utf8")).resolves.toContain(
      "# AI Research Wiki",
    );
    expect((await stat(path.join(workspace, "raw/inbox/README.md"))).isFile()).toBe(true);
  });

  it("reports Phase 2 workspace status as JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "status", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      ok: true,
      command: "status",
      workspace,
      data: {
        initialized: true,
        name: "AI Research",
        lint: { ok: true },
      },
      warnings: [expect.objectContaining({ code: "AGENT_PACK_PENDING" })],
    });
    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: "MCP_PENDING" }));
  });

  it("runs workspace lint and returns lint failures as JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    await writeFile(path.join(workspace, "wiki/log.md"), "# Log\n\n## June 15\n", "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "lint", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: false,
      command: "lint",
      workspace,
      data: {
        issues: [expect.objectContaining({ code: "LOG_INVALID_DATE_HEADING" })],
      },
      warnings: [],
    });
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
        plannedFiles: expect.arrayContaining(["okfh.config.yaml", "wiki/index.md"]),
      },
    });
    await expect(stat(workspace)).rejects.toMatchObject({ code: "ENOENT" });
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
