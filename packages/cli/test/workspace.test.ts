import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("@okf-harness/cli workspace", () => {
  it("reports workspace status as JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
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
        check: {
          status: "ready",
          okfVersion: "0.1",
        },
      },
      warnings: [],
    });
  });

  it("keeps status as a quick overview instead of full check output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    const sourcePath = path.join(root, "paper.md");
    await writeFile(sourcePath, "# Paper\n\nOriginal.\n", "utf8");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let addStdout = "";
    await runCli(
      ["node", "okfh", "source", "add", sourcePath, "--workspace", workspace, "--json"],
      {
        writeOut: (chunk) => {
          addStdout += chunk;
        },
        writeErr: () => {},
      },
    );
    const added = JSON.parse(addStdout);
    await writeFile(path.join(workspace, added.data.source.path), "# Paper\n\nChanged.\n", "utf8");
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
      data: {
        check: {
          status: "needs_attention",
          okfVersion: "0.1",
        },
      },
    });
    expect(result.data).not.toHaveProperty("okfConformance");
    expect(result.data).not.toHaveProperty("harnessLint");
  });

  it("checks a ready workspace as JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      command: "check",
      workspace,
      data: {
        status: "ready",
        okfVersion: "0.1",
        okfConformance: {
          ok: true,
          findings: [],
        },
        harnessLint: {
          ok: true,
          findings: {
            high: [],
            medium: [],
            low: [],
          },
        },
      },
      warnings: [],
    });
  });

  it("renders concise human check output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Status: Ready");
    expect(stdout).toContain("OKF version: 0.1");
    expect(stdout).toContain("OKF conformance: pass");
    expect(stdout).toContain("Harness lint: pass");
  });

  it("keeps needs-attention checks successful for scripts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    const sourcePath = path.join(root, "paper.md");
    await writeFile(sourcePath, "# Paper\n\nOriginal.\n", "utf8");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let addStdout = "";
    await runCli(
      ["node", "okfh", "source", "add", sourcePath, "--workspace", workspace, "--json"],
      {
        writeOut: (chunk) => {
          addStdout += chunk;
        },
        writeErr: () => {},
      },
    );
    const added = JSON.parse(addStdout);
    await writeFile(path.join(workspace, added.data.source.path), "# Paper\n\nChanged.\n", "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      command: "check",
      data: {
        status: "needs_attention",
        harnessLint: {
          findings: {
            high: [expect.objectContaining({ code: "SOURCE_HASH_DRIFT" })],
          },
        },
      },
    });
  });

  it("fails blocked checks when OKF conformance fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    await writeFile(path.join(workspace, "wiki/log.md"), "# Log\n\n## June 15\n", "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
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
      command: "check",
      data: {
        status: "blocked",
        okfConformance: {
          ok: false,
          findings: [expect.objectContaining({ code: "LOG_INVALID_DATE_HEADING" })],
        },
      },
    });
  });

  it("points retired lint usage to check", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
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
        retired: true,
        replacement: "check",
      },
      warnings: [],
      next: ["Use okfh check --workspace <path> --json instead."],
    });
  });

  it("fails check when the workspace is not initialized", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
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
      command: "check",
      workspace,
      data: {},
      error: {
        code: "WORKSPACE_NOT_INITIALIZED",
      },
    });
  });
});
