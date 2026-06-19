import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installAgentAdapters, packageInfo, renderAgentAdapter } from "../src/index.js";

describe("@okf-harness/agent-pack", () => {
  it("exposes package metadata", () => {
    expect(packageInfo).toEqual({
      name: "@okf-harness/agent-pack",
      role: "agent-pack",
    });
  });

  it("renders discoverable layered skills and root guidance for Claude and Codex", () => {
    const claude = renderAgentAdapter({ adapter: "claude" });
    const codex = renderAgentAdapter({ adapter: "codex" });

    expect(claude.files.map((file) => file.path)).toEqual([
      "CLAUDE.md",
      ".claude/skills/okf-harness/SKILL.md",
      ".claude/skills/okf-harness/references/setup.md",
      ".claude/skills/okf-harness/references/check.md",
      ".claude/skills/okf-harness/references/ingest.md",
      ".claude/skills/okf-harness/references/answer.md",
      ".claude/skills/okf-harness/references/graph.md",
    ]);
    expect(codex.files.map((file) => file.path)).toEqual([
      "AGENTS.md",
      ".agents/skills/okf-harness/SKILL.md",
      ".agents/skills/okf-harness/references/setup.md",
      ".agents/skills/okf-harness/references/check.md",
      ".agents/skills/okf-harness/references/ingest.md",
      ".agents/skills/okf-harness/references/answer.md",
      ".agents/skills/okf-harness/references/graph.md",
    ]);

    const claudeSkill = fileContents(claude.files, ".claude/skills/okf-harness/SKILL.md");
    const codexSkill = fileContents(codex.files, ".agents/skills/okf-harness/SKILL.md");
    expect(claudeSkill).toContain("name: okf-harness");
    expect(claudeSkill).toContain("One Door workflow for OKF Harness workspaces");
    expect(claudeSkill).toContain("generic Markdown editing");
    expect(claudeSkill).toContain("repository dependency graphs");
    expect(claudeSkill).toContain("Do not expose old workflow-specific skill names");
    expect(claudeSkill).toContain('okf-harness-managed: "true"');
    expect(claudeSkill).toContain("references/setup.md");
    expect(claudeSkill).toContain("references/check.md");
    expect(claudeSkill).toContain("references/ingest.md");
    expect(claudeSkill).toContain("references/answer.md");
    expect(claudeSkill).toContain("references/graph.md");
    expect(claudeSkill).not.toContain("allowed-tools");
    expect(claudeSkill).not.toContain("disable-model-invocation");
    expect(codexSkill).toBe(claudeSkill);
    expect(claude.files.map((file) => file.contents).join("\n")).not.toContain("on macOS");
    expect(codex.files.map((file) => file.contents).join("\n")).not.toContain("on macOS");

    expect(fileContents(claude.files, "CLAUDE.md")).toContain("/okf-harness");
    expect(fileContents(codex.files, "AGENTS.md")).toContain("$okf-harness");
    expect(fileContents(claude.files, "CLAUDE.md")).not.toContain("/okf-harness-init");
    expect(fileContents(codex.files, "AGENTS.md")).not.toContain("$okf-harness-init");
    expect(fileContents(codex.files, "AGENTS.md")).toContain("okfh doctor --json");
    expect(fileContents(codex.files, ".agents/skills/okf-harness/references/answer.md")).toContain(
      "okfh read index --workspace <workspace> --json",
    );
    expect(fileContents(codex.files, ".agents/skills/okf-harness/references/answer.md")).toContain(
      "Do not run or hallucinate an `okfh query` command.",
    );
    expect(fileContents(codex.files, ".agents/skills/okf-harness/references/graph.md")).toContain(
      "Run graph only when the user asks",
    );
  });

  it("renders workflow references with explicit permission boundaries", () => {
    const codex = renderAgentAdapter({ adapter: "codex" });
    const referencePaths = [
      ".agents/skills/okf-harness/references/setup.md",
      ".agents/skills/okf-harness/references/check.md",
      ".agents/skills/okf-harness/references/ingest.md",
      ".agents/skills/okf-harness/references/answer.md",
      ".agents/skills/okf-harness/references/graph.md",
    ] as const;

    for (const referencePath of referencePaths) {
      const reference = fileContents(codex.files, referencePath);
      expect(reference).toContain("## Intent");
      expect(reference).toContain("## Preconditions");
      expect(reference).toContain("## Allowed Commands");
      expect(reference).toContain("## Allowed Writes");
      expect(reference).toContain("## Completion Condition");
    }

    expect(fileContents(codex.files, referencePaths[0])).toContain(
      "Do not install both adapters unless the user asks for both.",
    );
    expect(fileContents(codex.files, referencePaths[1])).toContain(
      "None. If the user asks to fix findings, treat it as a combined request",
    );
    expect(fileContents(codex.files, referencePaths[2])).toContain(
      "If registration or planning fails, stop before wiki edits",
    );
    expect(fileContents(codex.files, referencePaths[3])).toContain(
      "There is no `okfh query` command",
    );
    expect(fileContents(codex.files, referencePaths[4])).toContain(
      "not a repository dependency graph",
    );
  });

  it("renders strict skill metadata from the package version", async () => {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version: string };
    const codex = renderAgentAdapter({ adapter: "codex" });
    const skill = fileContents(codex.files, ".agents/skills/okf-harness/SKILL.md");

    expect(skill).toContain(`okf-harness-version: "${packageJson.version}"`);
    expect(skill).toContain('okf-harness-managed: "true"');
    expect(skill).not.toContain("okf-harness-managed: true");
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
    expect(result.writtenFiles).toContain(".agents/skills/okf-harness/SKILL.md");
    const guidance = await readFile(path.join(workspace, "AGENTS.md"), "utf8");
    expect(guidance).toContain("Keep this user-authored rule.");
    expect(guidance).toContain("<!-- OKF Harness: start -->");
    expect(guidance).toContain("$okf-harness");
    expect((await stat(path.join(workspace, ".agents/skills/okf-harness/SKILL.md"))).isFile()).toBe(
      true,
    );
  });

  it("removes old managed workflow skills during adapter repair", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    const oldSkillDir = path.join(workspace, ".agents/skills/okf-harness-init");
    const oldSkill = path.join(oldSkillDir, "SKILL.md");
    await mkdir(oldSkillDir, { recursive: true });
    await writeFile(
      oldSkill,
      '---\nname: okf-harness-init\nmetadata:\n  okf-harness-managed: "true"\n---\n',
      "utf8",
    );
    await writeFile(path.join(oldSkillDir, "extra.md"), "keep me\n", "utf8");

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result).toMatchObject({
      removedFiles: [".agents/skills/okf-harness-init/SKILL.md"],
      conflicts: [],
    });
    await expect(stat(oldSkillDir)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(path.join(workspace, ".agents/skills/okf-harness/SKILL.md")),
    ).resolves.toBeDefined();

    const backups = await readGoldenFiles(path.join(workspace, ".okfh/backups/agent-skills"));
    expect(backups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringMatching(/\.agents\/skills\/okf-harness-init\/SKILL\.md$/),
          contents: expect.stringContaining('okf-harness-managed: "true"'),
        }),
        expect.objectContaining({
          path: expect.stringMatching(/\.agents\/skills\/okf-harness-init\/extra\.md$/),
          contents: "keep me\n",
        }),
      ]),
    );
  });

  it("backs up user-authored old workflow skills before installing the unified skill", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    const oldSkillDir = path.join(workspace, ".agents/skills/okf-harness-query");
    const oldSkill = path.join(oldSkillDir, "SKILL.md");
    await mkdir(oldSkillDir, { recursive: true });
    await writeFile(oldSkill, "---\nname: okf-harness-query\n---\n\n# Custom Query\n", "utf8");
    await writeFile(path.join(oldSkillDir, "notes.md"), "custom notes\n", "utf8");

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result.conflicts).toEqual([]);
    await expect(stat(oldSkillDir)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(path.join(workspace, ".agents/skills/okf-harness/SKILL.md")),
    ).resolves.toBeDefined();

    const backupRoot = path.join(workspace, ".okfh/backups/agent-skills");
    const backups = await readGoldenFiles(backupRoot);
    expect(backups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringMatching(/\.agents\/skills\/okf-harness-query\/SKILL\.md$/),
          contents: expect.stringContaining("# Custom Query"),
        }),
        expect.objectContaining({
          path: expect.stringMatching(/\.agents\/skills\/okf-harness-query\/notes\.md$/),
          contents: "custom notes\n",
        }),
      ]),
    );
  });

  it("backs up malformed old workflow skill directories before installing the unified skill", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    const oldSkillDir = path.join(workspace, ".agents/skills/okf-harness-maintain");
    await mkdir(oldSkillDir, { recursive: true });
    await writeFile(path.join(oldSkillDir, "notes.md"), "malformed but user-owned\n", "utf8");

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result.conflicts).toEqual([]);
    expect(result.removedFiles).toContain(".agents/skills/okf-harness-maintain");
    await expect(stat(oldSkillDir)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(path.join(workspace, ".agents/skills/okf-harness/SKILL.md")),
    ).resolves.toBeDefined();

    const backupRoot = path.join(workspace, ".okfh/backups/agent-skills");
    const backups = await readGoldenFiles(backupRoot);
    expect(backups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringMatching(/\.agents\/skills\/okf-harness-maintain\/notes\.md$/),
          contents: "malformed but user-owned\n",
        }),
      ]),
    );
  });

  it("repairs managed unified skill references without force", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    const skillRoot = path.join(workspace, ".agents/skills/okf-harness");
    await mkdir(path.join(skillRoot, "references"), { recursive: true });
    await writeFile(
      path.join(skillRoot, "SKILL.md"),
      "---\nname: okf-harness\nmetadata:\n  okf-harness-managed: true\n---\n\n# Old Skill\n",
      "utf8",
    );
    await writeFile(path.join(skillRoot, "references/answer.md"), "# Old Answer\n", "utf8");

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result.conflicts).toEqual([]);
    expect(result.replacedFiles).toEqual(
      expect.arrayContaining([
        ".agents/skills/okf-harness/SKILL.md",
        ".agents/skills/okf-harness/references/answer.md",
      ]),
    );
    await expect(readFile(path.join(skillRoot, "references/answer.md"), "utf8")).resolves.toContain(
      "There is no `okfh query` command",
    );
  });

  it("refuses to overwrite a same-name non-managed skill unless forced", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    await writeFile(path.join(workspace, "AGENTS.md"), "# Project Rules\n", "utf8");
    const customSkill = path.join(workspace, ".agents/skills/okf-harness/SKILL.md");
    await mkdir(path.dirname(customSkill), { recursive: true });
    await writeFile(customSkill, "---\nname: okf-harness\n---\n\n# Custom Skill\n", "utf8");

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: ".agents/skills/okf-harness/SKILL.md",
      }),
    ]);
    await expect(readFile(customSkill, "utf8")).resolves.toContain("# Custom Skill");
    await expect(readFile(path.join(workspace, "AGENTS.md"), "utf8")).resolves.toBe(
      "# Project Rules\n",
    );
    await expect(
      stat(path.join(workspace, ".agents/skills/okf-harness/references/answer.md")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("leaves old workflow skills in place when the unified target conflicts", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "okfh-agent-pack-"));
    const oldSkillDir = path.join(workspace, ".agents/skills/okf-harness-query");
    await mkdir(oldSkillDir, { recursive: true });
    await writeFile(
      path.join(oldSkillDir, "SKILL.md"),
      "---\nname: okf-harness-query\n---\n",
      "utf8",
    );
    const customSkill = path.join(workspace, ".agents/skills/okf-harness/SKILL.md");
    await mkdir(path.dirname(customSkill), { recursive: true });
    await writeFile(customSkill, "---\nname: okf-harness\n---\n\n# Custom Skill\n", "utf8");

    const result = await installAgentAdapters({ workspaceRoot: workspace, adapter: "codex" });

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        path: ".agents/skills/okf-harness/SKILL.md",
      }),
    ]);
    expect(result.removedFiles).not.toContain(".agents/skills/okf-harness-query/SKILL.md");
    await expect(stat(oldSkillDir)).resolves.toBeDefined();
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
    expect(result.plannedFiles).toContain(".claude/skills/okf-harness/SKILL.md");
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
        expect(skillFile.contents).toContain('okf-harness-managed: "true"');
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
