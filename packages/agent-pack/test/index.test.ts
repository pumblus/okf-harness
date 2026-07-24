import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  installAgentAdapters,
  packageInfo,
  renderAgentAdapter,
  renderBootstrapAgent,
  supportedNativeIntegrationProfiles,
} from "../src/index.js";
import {
  adapterProfiles,
  agentAdapters,
  bootstrapAgentProfiles,
  bootstrapAgents,
  bootstrapReferenceTemplatePaths,
  bootstrapSkillName,
  referenceTemplatePaths,
  skillName,
} from "../src/profiles.js";

describe("@okf-harness/agent-pack", () => {
  it("exposes package metadata", () => {
    expect(packageInfo).toEqual({
      name: "@okf-harness/agent-pack",
      role: "agent-pack",
    });
  });

  it("keeps adapter and bootstrap profile contracts inspectable", () => {
    expect(agentAdapters).toEqual(["claude", "codex"]);
    expect(bootstrapAgents).toEqual(["codex", "claude"]);

    for (const adapter of agentAdapters) {
      const profile = adapterProfiles[adapter];
      const rendered = renderAgentAdapter({ adapter });
      expect(rendered.files.map((file) => file.path)).toEqual([
        profile.rootGuidancePath,
        `${profile.skillRoot}/${skillName}/SKILL.md`,
        ...referenceTemplatePaths.map(
          (templatePath) => `${profile.skillRoot}/${skillName}/references/${templatePath}`,
        ),
      ]);
      expect(fileContents(rendered.files, profile.rootGuidancePath)).toContain(
        `${profile.routePrefix}${skillName}`,
      );
    }

    for (const agent of bootstrapAgents) {
      const profile = bootstrapAgentProfiles[agent];
      const rendered = renderBootstrapAgent({ agent });
      expect(rendered.files.map((file) => file.path)).toEqual([
        `skills/${bootstrapSkillName}/SKILL.md`,
        ...bootstrapReferenceTemplatePaths.map(
          (templatePath) => `skills/${bootstrapSkillName}/references/${templatePath}`,
        ),
      ]);
      expect(fileContents(rendered.files, `skills/${bootstrapSkillName}/SKILL.md`)).toContain(
        `okf-harness-agent: "${agent}"`,
      );
      expect(profile.command).toBe(agent);
      expect(profile.description).toContain(profile.label);
    }
  });

  it("exposes one native integration catalog for setup and doctor", () => {
    expect(supportedNativeIntegrationProfiles.map((profile) => profile.id)).toEqual([
      "claude",
      "codex",
      "opencode",
      "pi",
      "hermes",
      "openclaw",
    ]);
    expect(supportedNativeIntegrationProfiles.find((profile) => profile.id === "codex")).toEqual(
      expect.objectContaining({
        label: "Codex",
        command: "codex",
        defaultSelected: true,
        nativeInstallCommands: [
          {
            command: "codex",
            args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"],
          },
          { command: "codex", args: ["plugin", "add", "okf-harness@okf-harness", "--json"] },
        ],
      }),
    );
    expect(
      supportedNativeIntegrationProfiles.find((profile) => profile.id === "openclaw"),
    ).toMatchObject({ defaultSelected: false });
  });

  it("checks supported adapters through shared render contracts", () => {
    for (const adapter of agentAdapters) {
      expectWorkspaceAdapterContract(adapter);
    }

    for (const agent of bootstrapAgents) {
      expectBootstrapAgentContract(agent);
    }
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
      ".claude/skills/okf-harness/references/reconcile.md",
      ".claude/skills/okf-harness/references/answer.md",
      ".claude/skills/okf-harness/references/graph.md",
    ]);
    expect(codex.files.map((file) => file.path)).toEqual([
      "AGENTS.md",
      ".agents/skills/okf-harness/SKILL.md",
      ".agents/skills/okf-harness/references/setup.md",
      ".agents/skills/okf-harness/references/check.md",
      ".agents/skills/okf-harness/references/ingest.md",
      ".agents/skills/okf-harness/references/reconcile.md",
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
    expect(claudeSkill).toContain("references/reconcile.md");
    expect(claudeSkill).toContain("references/answer.md");
    expect(claudeSkill).toContain("references/graph.md");
    expect(claudeSkill).not.toContain("allowed-tools");
    expect(claudeSkill).not.toContain("disable-model-invocation");
    expect(codexSkill).toBe(claudeSkill);
    for (const skill of [claudeSkill, codexSkill]) {
      expect(skill).toContain("## First Useful Loop");
      expect(skill).toContain(
        "route the first useful loop through existing setup, ingest, check, and answer workflows",
      );
      expect(skill).toContain(
        "first-loop blocker as the specific workflow step plus one concrete next action",
      );
      expect(skill).toContain("Normal answers use synthesized `wiki/` evidence");
      expect(skill).toContain("The CLI does not synthesize wiki content");
    }
    expect(claude.files.map((file) => file.contents).join("\n")).not.toContain("on macOS");
    expect(codex.files.map((file) => file.contents).join("\n")).not.toContain("on macOS");

    expect(fileContents(claude.files, "CLAUDE.md")).toContain("/okf-harness");
    expect(fileContents(codex.files, "AGENTS.md")).toContain("$okf-harness");
    expect(fileContents(claude.files, "CLAUDE.md")).not.toContain("/okf-harness-init");
    expect(fileContents(codex.files, "AGENTS.md")).not.toContain("$okf-harness-init");
    expect(fileContents(codex.files, "AGENTS.md")).toContain("okfh doctor --json");
    const claudeAnswer = fileContents(
      claude.files,
      ".claude/skills/okf-harness/references/answer.md",
    );
    const codexAnswer = fileContents(
      codex.files,
      ".agents/skills/okf-harness/references/answer.md",
    );
    for (const answer of [claudeAnswer, codexAnswer]) {
      expect(answer).toContain("## Steps");
      expect(answer).toContain("## Hard Boundaries");
      expect(answer).toContain('okfh evidence "<question>" --workspace <workspace> --json');
      expect(answer).toContain('Run `okfh evidence "<question>" --json` as the default');
      expect(answer).toContain("Do not run or hallucinate an `okfh query` command.");
      expect(answer).toContain("must not read `raw/` source bodies");
      expect(answer).toContain("at most one automatic follow-up `okfh read`");
      expect(answer).toContain("Evidence sufficiency and conflict judgment belong to the agent");
      expect(answer).toContain("## First-Answer Check");
      expect(answer).toContain("What is the source mainly about?");
      expect(answer).toContain("What are its key conclusions?");
      expect(answer).toContain("Where does the evidence come from?");
      expect(answer).toContain("answer directly first");
      expect(answer).not.toContain("okfh read index --workspace <workspace> --json");
    }
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
      ".agents/skills/okf-harness/references/reconcile.md",
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
    const ingestReference = fileContents(codex.files, referencePaths[2]);
    expect(ingestReference).toContain("If registration or planning fails, stop before wiki edits");
    expect(ingestReference).toContain("This limit is agent-enforced guidance");
    expect(ingestReference).toContain("Their reasons are mechanical metadata matches");
    expect(ingestReference).toContain("If it is present, the CLI has not created the file");
    expect(ingestReference).not.toContain("v0.3.2");
    expect(fileContents(codex.files, referencePaths[4])).toContain("No such command exists");
    expect(fileContents(codex.files, referencePaths[4])).toContain(
      'okfh evidence "<question>" --workspace <workspace> --json',
    );
    expect(fileContents(codex.files, referencePaths[5])).toContain(
      "not a repository dependency graph",
    );
  });

  it("renders the reconciliation workflow and stop contract", () => {
    const codex = renderAgentAdapter({ adapter: "codex" });
    const skill = fileContents(codex.files, ".agents/skills/okf-harness/SKILL.md");
    const reconciliation = fileContents(
      codex.files,
      ".agents/skills/okf-harness/references/reconcile.md",
    );
    const answer = fileContents(codex.files, ".agents/skills/okf-harness/references/answer.md");
    const stopPredicate =
      "An Agent stop is permitted only when the information needed to decide safely exists solely in the user's head.";
    const renderedGuidance = codex.files.map((file) => file.contents).join("\n");

    expect(renderedGuidance.split(stopPredicate)).toHaveLength(2);
    expect(skill).toContain("revision identity remains in doubt");
    expect(skill).toContain("an unresolved contradiction");
    expect(skill).toContain("a suspected removal");
    expect(skill).toContain("examples, not a closed boundary");
    expect(skill).toContain('"shall I" always means investigate, never repair');
    expect(skill).toContain("Never re-register drifted bytes to lift a seal.");
    expect(reconciliation).toContain("read both registered revisions");
    expect(reconciliation).toContain("reviewing it is not reconciliation");
    expect(reconciliation).toContain("update every affected concept's prose directly");
    expect(reconciliation).toContain("the end of the reconciliation workflow");
    expect(reconciliation).toContain(
      "okfh source reconcile <prior-source-id> <revision-source-id>",
    );
    expect(reconciliation).toContain("A destructive replacement does not stop");
    expect(reconciliation).toContain("prior claim will no longer be served");
    expect(answer).toContain("one plain sentence naming which questions");
    expect(answer).toContain(
      "Keep condition codes, seal payloads, and seal vocabulary out of the user response",
    );
    expect(answer).toContain("Widen the internal seal beyond the Harness's two computed hops");
    expect(answer).toContain("report the widening instead of interrupting the user");
  });

  it("renders strict skill metadata from the package version", async () => {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version: string };
    const codex = renderAgentAdapter({ adapter: "codex" });
    const skill = fileContents(codex.files, ".agents/skills/okf-harness/SKILL.md");

    expect(skill).toContain(`okf-harness-version: "${packageJson.version}"`);
    expect(skill).toContain('okf-harness-managed: "true"');
    expect(skill).toContain('okf-harness-entrypoint: "workspace"');
    expect(skill).not.toContain("okf-harness-managed: true");
  });

  it("renders global bootstrap skills for Claude and Codex", async () => {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version: string };
    const codex = renderBootstrapAgent({ agent: "codex" });
    const claude = renderBootstrapAgent({ agent: "claude" });
    const setupReferencePath = "skills/okf-harness-bootstrap/references/setup.md";
    const discoveryReferencePath = "skills/okf-harness-bootstrap/references/discovery.md";
    const repairReferencePath = "skills/okf-harness-bootstrap/references/repair.md";

    const expectedPaths = [
      "skills/okf-harness-bootstrap/SKILL.md",
      setupReferencePath,
      discoveryReferencePath,
      repairReferencePath,
    ];
    expect(codex.files.map((file) => file.path)).toEqual(expectedPaths);
    expect(claude.files.map((file) => file.path)).toEqual(expectedPaths);

    const codexSkill = fileContents(codex.files, "skills/okf-harness-bootstrap/SKILL.md");
    const claudeSkill = fileContents(claude.files, "skills/okf-harness-bootstrap/SKILL.md");
    for (const skill of [codexSkill, claudeSkill]) {
      expect(skill).toContain("name: okf-harness-bootstrap");
      expect(skill).toContain("Bootstrap OKF Harness before a workspace exists");
      expect(skill).toContain(`okf-harness-version: "${packageJson.version}"`);
      expect(skill).toContain('okf-harness-managed: "true"');
      expect(skill).toContain('okf-harness-entrypoint: "bootstrap"');
      expect(skill).toContain("references/setup.md");
      expect(skill).toContain("references/discovery.md");
      expect(skill).toContain("references/repair.md");
      expect(skill).toContain("resolved `--workspace <path>`");
      expect(skill).toContain("If `okfh` is missing");
      expect(skill).toContain("npx @okf-harness/setup@latest");
      expect(skill).not.toContain("npm install -g @okf-harness/cli");
      expect(skill).toContain("then stop with a fresh-session handoff");
      expect(skill).toContain("first-loop blocker with one concrete next action");
      expect(skill).toContain("Completion criterion");
      expect(skill).not.toContain("references/check.md");
      expect(skill).not.toContain("references/ingest.md");
      expect(skill).not.toContain("references/answer.md");
      expect(skill).not.toContain("references/graph.md");
      expect(skill).not.toContain("## First-Answer Check");
      expect(skill).not.toContain('okfh evidence "<question>"');
      expect(skill).not.toContain("What is the source mainly about?");
    }
    expect(codexSkill).toContain('okf-harness-agent: "codex"');
    const codexSetup = fileContents(codex.files, setupReferencePath);
    const codexRepair = fileContents(codex.files, repairReferencePath);
    expect(codexSetup).toContain("$okf-harness");
    expect(codexSetup).toContain("--agents codex");
    expect(codexSetup).not.toContain("--agents claude");
    expect(codexSetup).not.toContain("--agents all");
    expect(codexRepair).toContain("okfh agent install codex --workspace <workspace> --json");
    expect(codexRepair).not.toContain("okfh agent install claude");
    expect(codexRepair).not.toContain("okfh agent install all");
    expect(claudeSkill).toContain('okf-harness-agent: "claude"');
    const claudeSetup = fileContents(claude.files, setupReferencePath);
    const claudeRepair = fileContents(claude.files, repairReferencePath);
    expect(claudeSetup).toContain("/okf-harness");
    expect(claudeSetup).toContain("--agents claude");
    expect(claudeSetup).not.toContain("--agents codex");
    expect(claudeSetup).not.toContain("--agents all");
    expect(claudeRepair).toContain("okfh agent install claude --workspace <workspace> --json");
    expect(claudeRepair).not.toContain("okfh agent install codex");
    expect(claudeRepair).not.toContain("okfh agent install all");

    expect(codexSetup).toContain("Ask only for inputs that remain missing or ambiguous");
    expect(codexSetup).toContain("Honor explicit user paths");
    expect(codexSetup).toContain("Documents/OKF Harness");
    expect(codexSetup).toContain("conservative folder slug");
    expect(codexSetup).toContain("allow a UTF-8 folder name");
    expect(codexSetup).toContain("default and recommended answer is no");
    expect(codexSetup).toContain("Before persistent writes");
    expect(codexSetup).toContain("choose an empty directory or a new subdirectory");
    expect(codexSetup).toContain("data.refresh.commands");
    expect(codexSetup).toContain("--dry-run --json");

    const codexDiscovery = fileContents(codex.files, discoveryReferencePath);
    expect(codexDiscovery).toContain("okfh status --json");
    expect(codexDiscovery).toContain("never create a nested workspace");
    expect(codexDiscovery).toContain("immediate child directories");
    expect(codexDiscovery).toContain("node_modules");
    expect(codexDiscovery).toContain("If zero workspaces are discovered, enter setup");
    expect(codexDiscovery).toContain("If one workspace is discovered, select it");
    expect(codexDiscovery).toContain("If multiple workspaces match");

    expect(codexRepair).toContain("Repair only Codex unless");
    expect(codexRepair).toContain("redirect the user to `$okf-harness`");
    expect(codexRepair).toContain("data.refresh.commands");
  });

  it("renders transitional setup-plus-source bootstrap guidance", () => {
    const codex = renderBootstrapAgent({ agent: "codex" });
    const skill = fileContents(codex.files, "skills/okf-harness-bootstrap/SKILL.md");

    expect(skill).toContain("setup-plus-source");
    expect(skill).toContain("Classify requested sources as local paths or URLs before setup");
    expect(skill).toContain("setup-plus-source then additionally uses the registration");
    expect(skill).toContain(
      "Validate every required local source path with metadata/readability checks before `okfh init`",
    );
    expect(skill).toContain("missing, non-file, or unreadable local inputs stop setup");
    expect(skill).toContain("Report all invalid local inputs before creating or selecting");
    expect(skill).toContain("URL sources are accepted as source pointers only");
    expect(skill).toContain(
      "Do not fetch, scrape, summarize, or imply webpage content was captured",
    );
    expect(skill).toContain("register each accepted source and prepare an ingest plan");
    expect(skill).toContain("returned `data.source.id`");
    expect(skill).toContain("okfh source add <source> --workspace <workspace> --json");
    expect(skill).toContain("okfh ingest plan <source-id> --workspace <workspace> --json");
    expect(skill).toContain(
      "local source validation, source registration, or ingest planning fails",
    );
    expect(skill).toContain("first-loop blocker with one concrete next action");
    expect(skill).toContain("successful ingest plan, and a fresh-session handoff");
    expect(skill).toContain("Do not read raw source bodies or write `wiki/` content");
    expect(skill).toContain("Hand off wiki synthesis to `$okf-harness`");
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
      'okfh evidence "<question>" --workspace <workspace> --json',
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

function expectWorkspaceAdapterContract(adapter: (typeof agentAdapters)[number]): void {
  const profile = adapterProfiles[adapter];
  const rendered = renderAgentAdapter({ adapter });
  const paths = new Set(rendered.files.map((file) => file.path));
  const skillPath = `${profile.skillRoot}/${skillName}/SKILL.md`;

  expect(rendered.adapter).toBe(adapter);
  expect(paths.has(profile.rootGuidancePath)).toBe(true);
  const rootGuidance = fileContents(rendered.files, profile.rootGuidancePath);
  expect(rootGuidance).toContain("<!-- OKF Harness: start -->");
  expect(rootGuidance).toContain("<!-- OKF Harness: end -->");
  expect(rootGuidance).toContain(`${profile.routePrefix}${skillName}`);
  expect(rootGuidance).toContain("okfh --json");

  expect(paths.has(skillPath)).toBe(true);
  const skill = fileContents(rendered.files, skillPath);
  expect(skill).toContain(`name: ${skillName}`);
  expect(skill).toMatch(/^description: .+Use when .+Do not use .+$/m);
  expect(skill).toContain('okf-harness-managed: "true"');
  expect(skill).toContain('okf-harness-entrypoint: "workspace"');

  for (const templatePath of referenceTemplatePaths) {
    const referencePath = `${profile.skillRoot}/${skillName}/references/${templatePath}`;
    expect(paths.has(referencePath)).toBe(true);
    expect(skill).toContain(`references/${templatePath}`);
    const reference = fileContents(rendered.files, referencePath);
    expect(reference).toContain("## Intent");
    expect(reference).toContain("## Preconditions");
    expect(reference).toContain("## Allowed Commands");
    expect(reference).toContain("## Allowed Writes");
    expect(reference).toContain("## Completion Condition");
  }
}

function expectBootstrapAgentContract(agent: (typeof bootstrapAgents)[number]): void {
  const profile = bootstrapAgentProfiles[agent];
  const rendered = renderBootstrapAgent({ agent });
  const paths = new Set(rendered.files.map((file) => file.path));
  const skillPath = `skills/${bootstrapSkillName}/SKILL.md`;

  expect(rendered.agent).toBe(agent);
  expect(paths.has(skillPath)).toBe(true);
  const skill = fileContents(rendered.files, skillPath);
  expect(skill).toContain(`name: ${bootstrapSkillName}`);
  expect(skill).toMatch(/^description: .+Use when .+Do not use .+$/m);
  expect(skill).toContain(profile.label);
  expect(skill).toContain('okf-harness-managed: "true"');
  expect(skill).toContain('okf-harness-entrypoint: "bootstrap"');
  expect(skill).toContain(`okf-harness-agent: "${agent}"`);

  for (const templatePath of bootstrapReferenceTemplatePaths) {
    const referencePath = `skills/${bootstrapSkillName}/references/${templatePath}`;
    expect(paths.has(referencePath)).toBe(true);
    expect(skill).toContain(`references/${templatePath}`);
    const reference = fileContents(rendered.files, referencePath);
    expect(reference).toContain("## Intent");
    expect(reference).toContain("## Preconditions");
    expect(reference).toContain("## Allowed Commands");
    expect(reference).toContain("## Allowed Writes");
    expect(reference).toContain("## Completion Condition");
  }

  const setup = fileContents(rendered.files, `skills/${bootstrapSkillName}/references/setup.md`);
  const repair = fileContents(rendered.files, `skills/${bootstrapSkillName}/references/repair.md`);
  expect(setup).toContain(`${profile.routePrefix}${skillName}`);
  expect(setup).toContain(`--agents ${agent}`);
  expect(setup).not.toContain("--agents all");
  expect(repair).toContain(`okfh agent install ${agent} --workspace <workspace> --json`);
  expect(repair).toContain(`${profile.routePrefix}${skillName}`);
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
