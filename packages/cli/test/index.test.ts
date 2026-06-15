import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("@okf-harness/cli", () => {
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

  it("reports Phase 4 workspace status as JSON", async () => {
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

  it("registers a local file source without leaking absolute provenance", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    const sourcePath = path.join(root, "private-client", "llm-wiki.md");
    const sourceContents = "# LLM Wiki\n\nSource notes.\n";
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, sourceContents, "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(
      ["node", "okfh", "source", "add", sourcePath, "--workspace", workspace, "--json"],
      {
        writeOut: (chunk) => {
          stdout += chunk;
        },
        writeErr: (chunk) => {
          stderr += chunk;
        },
      },
    );

    const sha256 = createHash("sha256").update(sourceContents).digest("hex");
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      ok: true,
      command: "source add",
      workspace,
      data: {
        action: "registered",
        dryRun: false,
        source: {
          kind: "file",
          original: "llm-wiki.md",
          path: expect.stringMatching(/^raw\/sources\/\d{4}\/\d{2}\/llm-wiki\.md$/),
          sha256,
          status: "registered",
        },
      },
      warnings: [],
      next: [expect.stringContaining("okfh ingest plan")],
    });
    const rawPath = path.join(workspace, result.data.source.path);
    await expect(readFile(rawPath, "utf8")).resolves.toBe(sourceContents);
    const manifest = await readFile(path.join(workspace, ".okfh/manifest.jsonl"), "utf8");
    expect(manifest).toContain(`"sha256":"${sha256}"`);
    expect(manifest).toContain('"original":"llm-wiki.md"');
    expect(manifest).not.toContain(sourcePath);
    expect(manifest).not.toContain("private-client");
  });

  it("reuses an existing source when another local file has identical content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    const firstPath = path.join(root, "first.md");
    const secondPath = path.join(root, "renamed.md");
    await writeFile(firstPath, "# Same\n\nContent.\n", "utf8");
    await writeFile(secondPath, "# Same\n\nContent.\n", "utf8");

    const first = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      firstPath,
      "--workspace",
      workspace,
      "--json",
    ]);
    const second = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      secondPath,
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.result).toMatchObject({
      ok: true,
      command: "source add",
      data: {
        action: "reused",
        source: {
          id: first.result.data.source.id,
          path: first.result.data.source.path,
          original: "first.md",
        },
      },
    });
    const manifestLines = (await readFile(path.join(workspace, ".okfh/manifest.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/);
    expect(manifestLines).toHaveLength(1);
  });

  it("suffixes the raw filename when a same-name local file has different content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    const firstPath = path.join(root, "one", "paper.md");
    const secondPath = path.join(root, "two", "paper.md");
    await mkdir(path.dirname(firstPath), { recursive: true });
    await mkdir(path.dirname(secondPath), { recursive: true });
    await writeFile(firstPath, "# Paper\n\nFirst.\n", "utf8");
    await writeFile(secondPath, "# Paper\n\nSecond.\n", "utf8");

    const first = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      firstPath,
      "--workspace",
      workspace,
      "--json",
    ]);
    const second = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      secondPath,
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(first.result.data.source.path).toMatch(/^raw\/sources\/\d{4}\/\d{2}\/paper\.md$/);
    expect(second.exitCode).toBe(0);
    expect(second.result).toMatchObject({
      ok: true,
      data: {
        action: "registered",
        source: {
          original: "paper.md",
          path: expect.stringMatching(/^raw\/sources\/\d{4}\/\d{2}\/paper-2\.md$/),
        },
      },
    });
    await expect(
      readFile(path.join(workspace, second.result.data.source.path), "utf8"),
    ).resolves.toBe("# Paper\n\nSecond.\n");
  });

  it("dry-runs source add without writing raw files or manifest rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    const sourcePath = path.join(root, "draft.md");
    await writeFile(sourcePath, "# Draft\n\nNot registered yet.\n", "utf8");

    const result = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--dry-run",
      "--json",
    ]);

    expect(result).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "source add",
        data: {
          action: "planned",
          dryRun: true,
          source: {
            original: "draft.md",
            path: expect.stringMatching(/^raw\/sources\/\d{4}\/\d{2}\/draft\.md$/),
          },
        },
      },
    });
    await expect(stat(path.join(workspace, result.result.data.source.path))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(path.join(workspace, ".okfh/manifest.jsonl"), "utf8")).resolves.toBe("");
  });

  it("registers URL metadata sources and reuses duplicate URLs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });

    const first = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      "https://example.com/research/article",
      "--workspace",
      workspace,
      "--json",
    ]);
    const second = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      "https://example.com/research/article",
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(first).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        data: {
          action: "registered",
          source: {
            kind: "url",
            original: "https://example.com/research/article",
            path: expect.stringMatching(
              /^raw\/sources\/\d{4}\/\d{2}\/example-com-research-article\.url\.md$/,
            ),
          },
        },
      },
    });
    await expect(
      readFile(path.join(workspace, first.result.data.source.path), "utf8"),
    ).resolves.toEqual(expect.stringContaining("URL: https://example.com/research/article"));
    expect(second.result).toMatchObject({
      ok: true,
      data: {
        action: "reused",
        source: {
          id: first.result.data.source.id,
          path: first.result.data.source.path,
        },
      },
    });
    const manifestLines = (await readFile(path.join(workspace, ".okfh/manifest.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/);
    expect(manifestLines).toHaveLength(1);
  });

  it("rolls back a copied raw file when manifest registration fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    const manifestPath = path.join(workspace, ".okfh/manifest.jsonl");
    await chmod(manifestPath, 0o444);
    const sourcePath = path.join(root, "rollback.md");
    await writeFile(sourcePath, "# Rollback\n\nNo half-written raw source.\n", "utf8");

    const result = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(result.exitCode).toBe(5);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      command: "source add",
      data: { code: "SOURCE_REGISTRATION_FAILED" },
    });
    await expect(listRawSourceFiles(workspace)).resolves.toEqual(["raw/sources/README.md"]);
  });

  it("lists registered sources from the manifest", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    const sourcePath = path.join(root, "listed.md");
    await writeFile(sourcePath, "# Listed\n", "utf8");
    const added = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);

    const listed = await runJsonCli([
      "node",
      "okfh",
      "source",
      "list",
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(listed).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "source list",
        workspace,
        data: {
          sources: [
            expect.objectContaining({
              id: added.result.data.source.id,
              path: added.result.data.source.path,
              original: "listed.md",
            }),
          ],
        },
        warnings: [],
      },
    });
  });

  it("creates a metadata-level ingest plan for a registered source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(["node", "okfh", "init", workspace, "--name", "AI Research", "--json"], {
      writeOut: () => {},
      writeErr: () => {},
    });
    await writeFile(
      path.join(workspace, "wiki/topics/llm-wiki.md"),
      "---\ntype: topic\ntitle: LLM Wiki\ntags: [llm, wiki]\n---\n# LLM Wiki\n",
      "utf8",
    );
    const sourcePath = path.join(root, "llm-wiki-paper.md");
    await writeFile(sourcePath, "# Source body is for the Agent, not the plan.\n", "utf8");
    const added = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);

    const plan = await runJsonCli([
      "node",
      "okfh",
      "ingest",
      "plan",
      added.result.data.source.id,
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(plan).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "ingest plan",
        workspace,
        data: {
          source: {
            id: added.result.data.source.id,
            path: added.result.data.source.path,
          },
          recommendedReferencePath: "wiki/references/llm-wiki-paper.md",
          candidateConcepts: [
            expect.objectContaining({
              id: "topics/llm-wiki",
              path: "wiki/topics/llm-wiki.md",
              reason: expect.stringContaining("metadata"),
            }),
          ],
          checklist: expect.arrayContaining([
            expect.stringContaining("Read the full registered source"),
            expect.stringContaining("Run okfh lint --workspace <workspace> --json"),
          ]),
        },
        warnings: [],
      },
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
      data: {
        code: "WORKSPACE_NOT_INITIALIZED",
      },
    });
    await expect(stat(path.join(workspace, "AGENTS.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

async function runJsonCli(argv: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  // biome-ignore lint/suspicious/noExplicitAny: CLI JSON integration tests need loose nested access.
  result: any;
}> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(argv, {
    writeOut: (chunk) => {
      stdout += chunk;
    },
    writeErr: (chunk) => {
      stderr += chunk;
    },
  });
  return {
    exitCode,
    stdout,
    stderr,
    result: stdout.length > 0 ? JSON.parse(stdout) : undefined,
  };
}

async function listRawSourceFiles(workspace: string): Promise<string[]> {
  const root = path.join(workspace, "raw/sources");
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .join("raw/sources", path.relative(root, path.join(entry.parentPath, entry.name)))
        .split(path.sep)
        .join(path.posix.sep),
    )
    .sort();
}
