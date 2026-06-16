import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("@okf-harness/cli workspace", () => {
  it("reports workspace status as JSON", async () => {
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
      warnings: [],
    });
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
});
