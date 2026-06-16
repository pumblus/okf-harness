import { mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("@okf-harness/cli agent", () => {
  it("installs Codex adapter support into an existing workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["node", "okfh", "agent", "install", "codex", "--workspace", workspace, "--json"],
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
      command: "agent install",
      workspace,
      data: {
        adapter: "codex",
        dryRun: false,
        conflicts: [],
        managedBlocks: [expect.objectContaining({ path: "AGENTS.md" })],
      },
      warnings: [],
    });
    await expect(readFile(path.join(workspace, "AGENTS.md"), "utf8")).resolves.toContain(
      "$okf-harness-init",
    );
    await expect(
      readFile(path.join(workspace, ".agents/skills/okf-harness-init/SKILL.md"), "utf8"),
    ).resolves.toContain("okf-harness-managed: true");
  });

  it("refuses to install adapter support outside an initialized workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["node", "okfh", "agent", "install", "codex", "--workspace", workspace, "--json"],
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
      command: "agent install",
      workspace,
      data: {},
      error: {
        code: "WORKSPACE_NOT_INITIALIZED",
      },
    });
    await expect(stat(path.join(workspace, "AGENTS.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
