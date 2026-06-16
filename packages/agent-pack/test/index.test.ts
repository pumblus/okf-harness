import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installAgentAdapters, packageInfo, renderAgentAdapter } from "../src/index.js";

describe("@okf-harness/agent-pack", () => {
  it("exposes Phase 6 package metadata", () => {
    expect(packageInfo).toEqual({
      name: "@okf-harness/agent-pack",
      role: "agent-pack",
      phase: 6,
    });
  });

  it("renders discoverable layered skills and root guidance for Claude and Codex", () => {
    const claude = renderAgentAdapter({ adapter: "claude" });
    const codex = renderAgentAdapter({ adapter: "codex" });

    expect(claude.files.map((file) => file.path)).toEqual([
      "CLAUDE.md",
      ".claude/skills/okf-harness-init/SKILL.md",
      ".claude/skills/okf-harness-init/references/workflow.md",
      ".claude/skills/okf-harness-ingest/SKILL.md",
      ".claude/skills/okf-harness-ingest/references/ingest-contract.md",
      ".claude/skills/okf-harness-query/SKILL.md",
      ".claude/skills/okf-harness-query/references/answer-contract.md",
      ".claude/skills/okf-harness-maintain/SKILL.md",
      ".claude/skills/okf-harness-maintain/references/lint-contract.md",
    ]);
    expect(codex.files.map((file) => file.path)).toEqual([
      "AGENTS.md",
      ".agents/skills/okf-harness-init/SKILL.md",
      ".agents/skills/okf-harness-init/references/workflow.md",
      ".agents/skills/okf-harness-ingest/SKILL.md",
      ".agents/skills/okf-harness-ingest/references/ingest-contract.md",
      ".agents/skills/okf-harness-query/SKILL.md",
      ".agents/skills/okf-harness-query/references/answer-contract.md",
      ".agents/skills/okf-harness-maintain/SKILL.md",
      ".agents/skills/okf-harness-maintain/references/lint-contract.md",
    ]);

    const claudeIngest = fileContents(claude.files, ".claude/skills/okf-harness-ingest/SKILL.md");
    const codexIngest = fileContents(codex.files, ".agents/skills/okf-harness-ingest/SKILL.md");
    const codexQuery = fileContents(codex.files, ".agents/skills/okf-harness-query/SKILL.md");
    const codexMaintain = fileContents(codex.files, ".agents/skills/okf-harness-maintain/SKILL.md");
    expect(claudeIngest).toContain("name: okf-harness-ingest");
    expect(claudeIngest).toContain("Use when the user asks to add, ingest");
    expect(claudeIngest).toContain("Do not use for general question answering");
    expect(claudeIngest).toContain("okf-harness-managed: true");
    expect(claudeIngest).toContain("See [the ingest contract](references/ingest-contract.md)");
    expect(claudeIngest).not.toContain("allowed-tools");
    expect(claudeIngest).not.toContain("disable-model-invocation");
    expect(codexIngest).toBe(claudeIngest);

    expect(fileContents(claude.files, "CLAUDE.md")).toContain("/okf-harness-init");
    expect(fileContents(codex.files, "AGENTS.md")).toContain("$okf-harness-init");
    expect(fileContents(codex.files, "AGENTS.md")).toContain("okfh doctor --json");
    expect(codexQuery).toContain("okfh read index --json");
    expect(codexQuery).toContain("Do not run or hallucinate an `okfh query` command.");
    expect(codexMaintain).toContain("Run `okfh graph --json` only when the user asks");
  });

  it("installs an adapter while preserving user root guidance outside the managed block", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    await writeFile(
      path.join(workspace, "AGENTS.md"),
      "# Project Rules\n\nKeep this user-authored rule.\n",
      "utf8",
    );

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result).toMatchObject({
      adapter: "codex",
      dryRun: false,
      conflicts: [],
      managedBlocks: [{ path: "AGENTS.md", action: "inserted" }],
    });
    expect(result.writtenFiles).toContain(".agents/skills/okf-harness-init/SKILL.md");
    const guidance = await readFile(path.join(workspace, "AGENTS.md"), "utf8");
    expect(guidance).toContain("Keep this user-authored rule.");
    expect(guidance).toContain("<!-- OKF Harness: start -->");
    expect(guidance).toContain("$okf-harness-maintain");
    expect(
      (await stat(path.join(workspace, ".agents/skills/okf-harness-init/SKILL.md"))).isFile(),
    ).toBe(true);
  });

  it("refuses to overwrite a same-name non-managed skill unless forced", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    await writeFile(path.join(workspace, "AGENTS.md"), "# Project Rules\n", "utf8");
    const customSkill = path.join(workspace, ".agents/skills/okf-harness-init/SKILL.md");
    await mkdir(path.dirname(customSkill), { recursive: true });
    await writeFile(customSkill, "---\nname: okf-harness-init\n---\n\n# Custom Skill\n", "utf8");

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: ".agents/skills/okf-harness-init/SKILL.md",
      }),
    ]);
    await expect(readFile(customSkill, "utf8")).resolves.toContain("# Custom Skill");
    await expect(readFile(path.join(workspace, "AGENTS.md"), "utf8")).resolves.toBe(
      "# Project Rules\n",
    );
    await expect(
      stat(path.join(workspace, ".agents/skills/okf-harness-query/SKILL.md")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses to modify root guidance with a malformed managed block", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    const guidancePath = path.join(workspace, "AGENTS.md");
    await writeFile(guidancePath, "# Project Rules\n\n<!-- OKF Harness: start -->\n", "utf8");

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: "AGENTS.md",
      }),
    ]);
    expect(result.managedBlocks).toEqual([]);
    await expect(readFile(guidancePath, "utf8")).resolves.toBe(
      "# Project Rules\n\n<!-- OKF Harness: start -->\n",
    );
  });

  it("returns an install plan without writing files during dry-run", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));

    const result = await installAgentAdapters({
      workspaceRoot: workspace,
      adapter: "claude",
      dryRun: true,
    });

    expect(result).toMatchObject({
      adapter: "claude",
      dryRun: true,
      writtenFiles: [],
      replacedFiles: [],
      conflicts: [],
    });
    expect(result.plannedFiles).toContain("CLAUDE.md");
    expect(result.plannedFiles).toContain(".claude/skills/okf-harness-query/SKILL.md");
    await expect(stat(path.join(workspace, "CLAUDE.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("renders skills that conform to Claude and Codex skill discovery rules", () => {
    const claude = renderAgentAdapter({ adapter: "claude" });
    const codex = renderAgentAdapter({ adapter: "codex" });

    expect(skillPaths(claude.files, ".claude/skills")).toEqual(
      skillPaths(codex.files, ".agents/skills"),
    );

    for (const adapter of [claude, codex]) {
      const paths = new Set(adapter.files.map((file) => file.path));
      for (const skillFile of adapter.files.filter((file) => file.path.endsWith("/SKILL.md"))) {
        const skillName = skillFile.path.split("/").at(-2);
        expect(skillName).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
        expect(skillFile.contents).toContain(`name: ${skillName}`);
        expect(skillFile.contents).toMatch(/^description: .+Use when .+Do not use .+$/m);
        expect(skillFile.contents).toContain("okf-harness-managed: true");
        expect(skillFile.contents).not.toContain("allowed-tools");
        expect(skillFile.contents).not.toContain("disable-model-invocation: true");
        for (const reference of referencedFiles(skillFile.contents)) {
          expect(paths.has(path.posix.join(path.posix.dirname(skillFile.path), reference))).toBe(
            true,
          );
        }
      }
    }

    const claudeSkills = skillContentsByName(claude.files);
    const codexSkills = skillContentsByName(codex.files);
    expect(codexSkills).toEqual(claudeSkills);
  });

  it("matches explicit golden fixtures for every generated adapter file", async () => {
    await expectGoldenAdapter("claude", renderAgentAdapter({ adapter: "claude" }).files);
    await expectGoldenAdapter("codex", renderAgentAdapter({ adapter: "codex" }).files);
  });
});

function fileContents(files: Array<{ path: string; contents: string }>, path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) {
    throw new Error(`Missing rendered file: ${path}`);
  }
  return file.contents;
}

function skillPaths(files: Array<{ path: string }>, root: string): string[] {
  return files
    .map((file) => file.path)
    .filter((filePath) => filePath.endsWith("/SKILL.md"))
    .map((filePath) => filePath.replace(root, "<skills>"))
    .sort();
}

function referencedFiles(contents: string): string[] {
  return [...contents.matchAll(/\]\((references\/[^)]+)\)/g)].map((match) => {
    const reference = match[1];
    if (reference === undefined) {
      throw new Error("Reference match did not include a path.");
    }
    return reference;
  });
}

function skillContentsByName(
  files: Array<{ path: string; contents: string }>,
): Record<string, string> {
  return Object.fromEntries(
    files
      .filter((file) => file.path.endsWith("/SKILL.md"))
      .map((file) => {
        const skillName = file.path.split("/").at(-2);
        if (skillName === undefined) {
          throw new Error(`Could not derive skill name from ${file.path}`);
        }
        return [skillName, file.contents];
      }),
  );
}

async function expectGoldenAdapter(
  adapter: "claude" | "codex",
  rendered: Array<{ path: string; contents: string }>,
): Promise<void> {
  const fixtureRoot = fileURLToPath(new URL(`golden/${adapter}/`, import.meta.url));
  const golden = await readGoldenFiles(fixtureRoot);
  expect([...rendered].sort((left, right) => left.path.localeCompare(right.path))).toEqual(golden);
}

async function readGoldenFiles(
  root: string,
  current = root,
): Promise<Array<{ path: string; contents: string }>> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        return readGoldenFiles(root, entryPath);
      }
      const relativePath = path.relative(root, entryPath).split(path.sep).join(path.posix.sep);
      return [{ path: relativePath, contents: await readFile(entryPath, "utf8") }];
    }),
  );
  return files.flat().sort((left, right) => left.path.localeCompare(right.path));
}
