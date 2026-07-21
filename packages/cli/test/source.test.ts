import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import { listRawSourceFiles, runJsonCli } from "./helpers.js";

describe("@okf-harness/cli source", () => {
  it("registers a local file source without leaking absolute provenance", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
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
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
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
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
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
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
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
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );

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
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
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
      data: {},
      error: { code: "SOURCE_REGISTRATION_FAILED" },
    });
    await expect(listRawSourceFiles(workspace)).resolves.toEqual(["raw/sources/README.md"]);
  });

  it("records a reconciliation, seals currency, and leaves later revisions unsealed", async () => {
    const { workspace, sourcePath, prior, revision } = await createSuspectedRevision();

    const before = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);
    expect(before.result.data.currency.sealed).toBe(false);

    const reconciled = await runJsonCli([
      "node",
      "okfh",
      "source",
      "reconcile",
      prior.result.data.source.id,
      revision.result.data.source.id,
      "--note",
      "Updated the Paper reference for v2.",
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(reconciled).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "source reconcile",
        workspace,
        data: {
          acknowledgement: {
            prior_source_id: prior.result.data.source.id,
            revision_source_id: revision.result.data.source.id,
            note: "Updated the Paper reference for v2.",
          },
        },
        warnings: [],
        next: [expect.stringContaining("okfh check")],
      },
    });
    const sealed = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);
    expect(sealed.result.data.currency).toMatchObject({ sealed: true, dangling: [] });

    await writeFile(sourcePath, "# Paper v3\n", "utf8");
    const later = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);
    const reopened = await runJsonCli([
      "node",
      "okfh",
      "check",
      "--workspace",
      workspace,
      "--json",
    ]);
    expect(reopened.result.data.currency).toMatchObject({
      sealed: false,
      dangling: [
        expect.objectContaining({
          priorSourceId: prior.result.data.source.id,
          revisionSourceId: later.result.data.source.id,
        }),
      ],
    });
  });

  it("returns reconciliation edge and note errors through the standard error envelope", async () => {
    const { workspace, prior, revision } = await createSuspectedRevision();
    const priorId = prior.result.data.source.id;
    const revisionId = revision.result.data.source.id;
    const cases = [
      {
        args: [priorId, revisionId],
        code: "RECONCILIATION_NOTE_REQUIRED",
      },
      {
        args: [revisionId, priorId, "--note", "Reconciled in the wrong direction."],
        code: "RECONCILIATION_EDGE_UNKNOWN",
      },
    ];

    for (const testCase of cases) {
      const result = await runJsonCli([
        "node",
        "okfh",
        "source",
        "reconcile",
        ...testCase.args,
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toMatchObject({
        ok: false,
        command: "source reconcile",
        workspace,
        data: {},
        warnings: [],
        error: { code: testCase.code },
      });
    }
  });

  it("rejects an invalid reconciliation ledger through the standard error envelope", async () => {
    const { workspace, prior, revision } = await createSuspectedRevision();
    await writeFile(path.join(workspace, ".okfh/reconciliation.jsonl"), "{not json}\n", "utf8");

    const result = await runJsonCli([
      "node",
      "okfh",
      "source",
      "reconcile",
      prior.result.data.source.id,
      revision.result.data.source.id,
      "--note",
      "Updated the Paper reference for v2.",
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      command: "source reconcile",
      workspace,
      data: {},
      warnings: [],
      error: { code: "RECONCILIATION_LEDGER_INVALID" },
    });
  });

  it("surfaces an unsafe reconciliation ledger path through the standard error envelope", async () => {
    const { workspace, prior, revision } = await createSuspectedRevision();
    const configPath = path.join(workspace, "okfh.config.yaml");
    const manifestPath = path.join(workspace, ".okfh/manifest.jsonl");
    await writeFile(
      path.join(workspace, "raw/sources/manifest.jsonl"),
      await readFile(manifestPath, "utf8"),
      "utf8",
    );
    await writeFile(
      configPath,
      (await readFile(configPath, "utf8")).replace(
        "manifest: .okfh/manifest.jsonl",
        "manifest: raw/sources/manifest.jsonl",
      ),
      "utf8",
    );

    const result = await runJsonCli([
      "node",
      "okfh",
      "source",
      "reconcile",
      prior.result.data.source.id,
      revision.result.data.source.id,
      "--note",
      "Updated the Paper reference for v2.",
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      command: "source reconcile",
      workspace,
      data: {},
      warnings: [],
      error: { code: "RECONCILIATION_LEDGER_PATH_UNSAFE" },
    });
  });

  it("lists registered sources from the manifest", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
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
});

async function createSuspectedRevision(): Promise<{
  workspace: string;
  sourcePath: string;
  prior: Awaited<ReturnType<typeof runJsonCli>>;
  revision: Awaited<ReturnType<typeof runJsonCli>>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
  const workspace = path.join(root, "ai-research");
  await runCli(
    ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
    {
      writeOut: () => {},
      writeErr: () => {},
    },
  );
  const sourcePath = path.join(root, "paper.md");
  await writeFile(sourcePath, "# Paper v1\n", "utf8");
  const prior = await runJsonCli([
    "node",
    "okfh",
    "source",
    "add",
    sourcePath,
    "--workspace",
    workspace,
    "--json",
  ]);
  await mkdir(path.join(workspace, "wiki/references"), { recursive: true });
  await writeFile(
    path.join(workspace, "wiki/references/paper.md"),
    `---\ntype: Reference\ntitle: Paper\nokfh:\n  source_id: ${prior.result.data.source.id}\n---\n# Paper\n`,
    "utf8",
  );
  await writeFile(sourcePath, "# Paper v2\n", "utf8");
  const revision = await runJsonCli([
    "node",
    "okfh",
    "source",
    "add",
    sourcePath,
    "--workspace",
    workspace,
    "--json",
  ]);
  return { workspace, sourcePath, prior, revision };
}
