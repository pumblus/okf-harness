import { mkdir, rm, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkWorkspace } from "../src/check/index.js";
import { lintWorkspace } from "../src/lint/index.js";
import { addSource } from "../src/source/index.js";
import { copyValidWorkspace, validWorkspaceFixture } from "./helpers.js";

describe("OKF hard linter", () => {
  it("passes the valid fixture workspace", async () => {
    const result = await lintWorkspace(validWorkspaceFixture);

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("reports missing frontmatter on non-reserved concept files", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "# Overview\nMissing frontmatter.\n",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "OKF_MISSING_FRONTMATTER",
        path: "wiki/topics/llm-wiki.md",
      }),
    ]);
  });

  it("reports missing type on non-reserved concept files", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "---\ntitle: LLM Wiki\n---\n# Overview\n",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "OKF_MISSING_TYPE",
        path: "wiki/topics/llm-wiki.md",
      }),
    ]);
  });

  it("reports concept frontmatter on reserved files", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(`${workspaceRoot}/wiki/index.md`, "---\ntype: Topic\n---\n# Index\n");

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RESERVED_FILE_HAS_CONCEPT_FRONTMATTER",
          path: "wiki/index.md",
        }),
      ]),
    );
  });

  it("allows bundle metadata on the root index", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/index.md`,
      '---\nokf_version: "0.1"\ncustom_bundle_field: local\n---\n# AI Research Wiki\n\n- [LLM Wiki](topics/llm-wiki.md)\n- [Karpathy LLM Wiki gist](references/karpathy-llm-wiki.md)\n',
      "utf8",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports invalid log date headings", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(`${workspaceRoot}/wiki/log.md`, "# Log\n\n## June 15\n");

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "LOG_INVALID_DATE_HEADING",
        line: 3,
        path: "wiki/log.md",
      }),
    ]);
  });

  it("reports invalid date headings in nested log files", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(`${workspaceRoot}/wiki/references/log.md`, "# Reference Log\n\n## June 15\n");

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "LOG_INVALID_DATE_HEADING",
        line: 3,
        path: "wiki/references/log.md",
      }),
    ]);
  });

  it("reports invalid manifest rows with line numbers", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await mkdir(`${workspaceRoot}/.okfh`, { recursive: true });
    await writeFile(`${workspaceRoot}/.okfh/manifest.jsonl`, "not-json\n", "utf8");

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "MANIFEST_INVALID",
        line: 1,
        path: ".okfh/manifest.jsonl",
      }),
    ]);
  });

  it("reports source hash drift when a registered raw source changes", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const inputPath = `${workspaceRoot}/paper.md`;
    await writeFile(inputPath, "# Paper\n\nOriginal.\n", "utf8");
    const added = await addSource({ workspaceRoot, input: inputPath });
    await writeFile(`${workspaceRoot}/${added.source.path}`, "# Paper\n\nChanged.\n", "utf8");

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "SOURCE_HASH_DRIFT",
        path: added.source.path,
      }),
    ]);
  });

  it("warns about a suspected source revision without blocking the workspace", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const priorPath = `${workspaceRoot}/prior/paper.md`;
    const revisionPath = `${workspaceRoot}/revision/paper.md`;
    await mkdir(`${workspaceRoot}/prior`);
    await mkdir(`${workspaceRoot}/revision`);
    await writeFile(priorPath, "# Paper\n\nOriginal.\n", "utf8");
    await writeFile(revisionPath, "# Paper\n\nRevised.\n", "utf8");
    const prior = await addSource({ workspaceRoot, input: priorPath });
    const revision = await addSource({ workspaceRoot, input: revisionPath });

    const lint = await lintWorkspace(workspaceRoot);
    const finding = lint.issues.find((issue) => issue.code === "SOURCE_LINEAGE_SUSPECTED");

    expect(lint.ok).toBe(true);
    expect(finding).toMatchObject({
      severity: "warning",
      path: revision.source.path,
    });
    expect(finding?.message).toContain(prior.source.id);
    expect(finding?.message).toContain(revision.source.id);

    const check = await checkWorkspace(workspaceRoot);
    expect(check).toMatchObject({
      status: "needs_attention",
      okfConformance: { ok: true, findings: [] },
      harnessLint: {
        ok: false,
        findings: {
          high: [],
          medium: [expect.objectContaining({ code: "SOURCE_LINEAGE_SUSPECTED" })],
          low: [],
        },
      },
    });
  });

  it("does not infer lineage from a deduped re-add or a different basename", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const paperPath = `${workspaceRoot}/paper.md`;
    const appendixPath = `${workspaceRoot}/appendix.md`;
    await writeFile(paperPath, "# Paper\n", "utf8");
    await writeFile(appendixPath, "# Different document\n", "utf8");
    await addSource({ workspaceRoot, input: paperPath });
    const reused = await addSource({ workspaceRoot, input: paperPath });
    await addSource({ workspaceRoot, input: appendixPath });

    const result = await lintWorkspace(workspaceRoot);

    expect(reused.action).toBe("reused");
    expect(result.issues).toEqual([]);
  });

  it("excludes URL sources from lineage", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await addSource({
      workspaceRoot,
      input: "https://first.example/reports/paper.md",
    });
    await addSource({
      workspaceRoot,
      input: "https://second.example/archive/paper.md",
    });

    const result = await lintWorkspace(workspaceRoot);

    expect(result.issues).toEqual([]);
  });

  it("links the newest revision to every earlier distinct-hash sibling", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const paperPath = `${workspaceRoot}/paper.md`;
    await writeFile(paperPath, "# Paper v1\n", "utf8");
    const first = await addSource({ workspaceRoot, input: paperPath });
    await writeFile(paperPath, "# Paper v2\n", "utf8");
    const second = await addSource({ workspaceRoot, input: paperPath });
    await writeFile(paperPath, "# Paper v3\n", "utf8");
    const revision = await addSource({ workspaceRoot, input: paperPath });

    const result = await lintWorkspace(workspaceRoot);
    const findings = result.issues.filter((issue) => issue.code === "SOURCE_LINEAGE_SUSPECTED");

    expect(findings).toEqual([
      expect.objectContaining({
        path: revision.source.path,
        message: expect.stringContaining(first.source.id),
      }),
      expect.objectContaining({
        path: revision.source.path,
        message: expect.stringContaining(second.source.id),
      }),
    ]);
    expect(findings.every((finding) => finding.message.includes(revision.source.id))).toBe(true);
  });

  it("reports missing registered raw sources", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const inputPath = `${workspaceRoot}/missing-source.md`;
    await writeFile(inputPath, "# Missing\n", "utf8");
    const added = await addSource({ workspaceRoot, input: inputPath });
    await rm(`${workspaceRoot}/${added.source.path}`);

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "SOURCE_MISSING",
        path: added.source.path,
      }),
    ]);
  });

  it("reports reference documents whose source id is not registered", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/references/unregistered-source.md`,
      "---\ntype: Reference\ntitle: Unregistered Source\nokfh:\n  source_id: src_20260615_9999\n---\n# Unregistered Source\n",
      "utf8",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "REFERENCE_SOURCE_MISSING",
          path: "wiki/references/unregistered-source.md",
        }),
      ]),
    );
  });

  it("warns about unregistered raw source files without failing lint", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/raw/sources/2026/06/unregistered.md`,
      "# Unregistered\n",
      "utf8",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "UNREGISTERED_RAW_SOURCE",
        severity: "warning",
        path: "raw/sources/2026/06/unregistered.md",
      }),
    ]);
  });

  it("warns when checkpoint policy is enabled outside a Git work tree", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await rm(`${workspaceRoot}/.git`, { recursive: true });

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "GIT_CHECKPOINT_POLICY_NOT_ENFORCED",
        severity: "warning",
        path: "okfh.config.yaml",
      }),
    ]);
  });

  it("warns about broken OKF markdown links without failing lint", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "---\ntype: Topic\ntitle: LLM Wiki\n---\n# Overview\n\nSee [Missing](/topics/missing.md).\n\n# Citations\n\n- /references/karpathy-llm-wiki.md\n",
      "utf8",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "BROKEN_LINK",
        severity: "warning",
        path: "wiki/topics/llm-wiki.md",
      }),
    ]);
  });

  it("warns about missing index entries without failing lint", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/unlisted.md`,
      "---\ntype: Topic\ntitle: Unlisted\n---\n# Overview\n\nA topic not linked from indexes.\n\n# Citations\n\n- /references/karpathy-llm-wiki.md\n",
      "utf8",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "MISSING_INDEX_ENTRY",
        severity: "warning",
        path: "wiki/topics/unlisted.md",
      }),
    ]);
  });

  it("warns about content concepts missing citations without failing lint", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "---\ntype: Topic\ntitle: LLM Wiki\n---\n# Overview\n\nA topic without citations.\n",
      "utf8",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "MISSING_CITATIONS_SECTION",
        severity: "warning",
        path: "wiki/topics/llm-wiki.md",
      }),
    ]);
  });
});
