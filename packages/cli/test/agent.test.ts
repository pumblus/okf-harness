import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("@okf-harness/cli agent", () => {
  it("installs Codex adapter support into an existing workspace", async () => {
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
      "$okf-harness",
    );
    await expect(
      readFile(path.join(workspace, ".agents/skills/okf-harness/SKILL.md"), "utf8"),
    ).resolves.toContain('okf-harness-managed: "true"');
  });

  it("backs up old workflow skills during adapter repair", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    const oldSkillDir = path.join(workspace, ".agents/skills/okf-harness-query");
    await mkdir(oldSkillDir, { recursive: true });
    await writeFile(
      path.join(oldSkillDir, "SKILL.md"),
      "---\nname: okf-harness-query\n---\n\n# Custom Query\n",
      "utf8",
    );
    await writeFile(path.join(oldSkillDir, "notes.md"), "custom notes\n", "utf8");

    const exitCode = await runCli(
      ["node", "okfh", "agent", "install", "codex", "--workspace", workspace, "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );

    expect(exitCode).toBe(0);
    await expect(stat(oldSkillDir)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(path.join(workspace, ".agents/skills/okf-harness/SKILL.md")),
    ).resolves.toBeDefined();
    const backupFiles = await listFiles(path.join(workspace, ".okfh/backups/agent-skills"));
    expect(backupFiles).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.agents\/skills\/okf-harness-query\/SKILL\.md$/),
        expect.stringMatching(/\.agents\/skills\/okf-harness-query\/notes\.md$/),
      ]),
    );
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

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        return listFiles(root, entryPath);
      }
      return [path.relative(root, entryPath).split(path.sep).join(path.posix.sep)];
    }),
  );
  return files.flat().sort();
}
