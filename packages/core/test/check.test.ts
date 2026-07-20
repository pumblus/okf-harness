import { mkdir, rm, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkWorkspace } from "../src/check/index.js";
import { addSource } from "../src/source/index.js";
import { clearReconciliation } from "../src/source/reconciliation.js";
import { copyValidWorkspace, validWorkspaceFixture } from "./helpers.js";

describe("OKF workspace check", () => {
  it("reports a valid workspace as ready", async () => {
    const result = await checkWorkspace(validWorkspaceFixture);

    expect(result).toEqual({
      status: "ready",
      okfVersion: "0.1",
      currency: {
        sealed: true,
        dangling: [],
        diagnostics: [],
      },
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
    });
  });

  it("reports currency only for dangling reconciliations involving promoted sources", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const draftPath = `${workspaceRoot}/draft.md`;
    await writeFile(draftPath, "# Draft v1\n", "utf8");
    await addSource({ workspaceRoot, input: draftPath });
    await writeFile(draftPath, "# Draft v2\n", "utf8");
    await addSource({ workspaceRoot, input: draftPath });

    expect((await checkWorkspace(workspaceRoot)).currency).toEqual({
      sealed: true,
      dangling: [],
      diagnostics: [],
    });

    const promotedPath = `${workspaceRoot}/karpathy-llm-wiki.md`;
    await writeFile(promotedPath, "# Revised source\n", "utf8");
    const revision = await addSource({ workspaceRoot, input: promotedPath });

    expect((await checkWorkspace(workspaceRoot)).currency).toEqual({
      sealed: false,
      dangling: [
        {
          original: "karpathy-llm-wiki.md",
          priorSourceId: "src_20260615_0001",
          revisionSourceId: revision.source.id,
          promotedBy: ["wiki/references/karpathy-llm-wiki.md"],
        },
      ],
      diagnostics: [],
    });

    await clearReconciliation({
      workspaceRoot,
      priorSourceId: "src_20260615_0001",
      revisionSourceId: revision.source.id,
      note: "Reconciled the promoted source revision.",
    });
    expect((await checkWorkspace(workspaceRoot)).currency).toEqual({
      sealed: true,
      dangling: [],
      diagnostics: [],
    });

    await writeFile(promotedPath, "# Third source revision\n", "utf8");
    const third = await addSource({ workspaceRoot, input: promotedPath });
    const reopened = await checkWorkspace(workspaceRoot);

    expect(reopened.currency).toEqual({
      sealed: false,
      dangling: [
        {
          original: "karpathy-llm-wiki.md",
          priorSourceId: "src_20260615_0001",
          revisionSourceId: third.source.id,
          promotedBy: ["wiki/references/karpathy-llm-wiki.md"],
        },
      ],
      diagnostics: [],
    });
    expect(reopened.status).toBe("needs_attention");
  });

  it("blocks workspaces that are not OKF-readable", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "# Overview\nMissing frontmatter.\n",
      "utf8",
    );

    const result = await checkWorkspace(workspaceRoot);

    expect(result).toMatchObject({
      status: "blocked",
      currency: {
        sealed: false,
        dangling: [],
        diagnostics: [
          expect.objectContaining({
            code: "OKF_MISSING_FRONTMATTER",
            path: "wiki/topics/llm-wiki.md",
          }),
        ],
      },
      okfConformance: {
        ok: false,
        findings: [
          expect.objectContaining({
            code: "OKF_MISSING_FRONTMATTER",
            path: "wiki/topics/llm-wiki.md",
          }),
        ],
      },
      harnessLint: {
        ok: true,
        findings: {
          high: [],
          medium: [],
          low: [],
        },
      },
    });
  });

  it("keeps root index bundle metadata out of OKF conformance findings", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/index.md`,
      '---\nokf_version: "0.1"\ncustom_bundle_field: local\n---\n# AI Research Wiki\n\n- [LLM Wiki](topics/llm-wiki.md)\n- [Karpathy LLM Wiki gist](references/karpathy-llm-wiki.md)\n',
      "utf8",
    );

    const result = await checkWorkspace(workspaceRoot);

    expect(result).toMatchObject({
      status: "ready",
      okfConformance: {
        ok: true,
        findings: [],
      },
    });
  });

  it("reports unreadable workspace data at its real path", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const sourcePath = `${workspaceRoot}/raw/sources/2026/06/karpathy-llm-wiki.md`;
    await rm(sourcePath);
    await mkdir(sourcePath);

    const result = await checkWorkspace(workspaceRoot);

    expect(result.harnessLint.findings.high).toContainEqual(
      expect.objectContaining({
        code: "WORKSPACE_READ_FAILED",
        path: "raw/sources/2026/06/karpathy-llm-wiki.md",
      }),
    );
    expect(result.harnessLint.findings.medium).not.toContainEqual(
      expect.objectContaining({ code: "CONFIG_INVALID" }),
    );
  });

  it("reports source drift as high-priority Harness lint without blocking OKF conformance", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const inputPath = `${workspaceRoot}/paper.md`;
    await writeFile(inputPath, "# Paper\n\nOriginal.\n", "utf8");
    const added = await addSource({ workspaceRoot, input: inputPath });
    await writeFile(`${workspaceRoot}/${added.source.path}`, "# Paper\n\nChanged.\n", "utf8");

    const result = await checkWorkspace(workspaceRoot);

    expect(result).toMatchObject({
      status: "needs_attention",
      okfConformance: {
        ok: true,
        findings: [],
      },
      harnessLint: {
        ok: false,
        findings: {
          high: [
            expect.objectContaining({
              code: "SOURCE_HASH_DRIFT",
              path: added.source.path,
            }),
          ],
          medium: [],
          low: [],
        },
      },
    });
  });

  it("reports unenforced checkpoint policy as Harness lint without blocking OKF conformance", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await rm(`${workspaceRoot}/.git`, { recursive: true });

    const result = await checkWorkspace(workspaceRoot);

    expect(result).toMatchObject({
      status: "needs_attention",
      okfConformance: {
        ok: true,
        findings: [],
      },
      harnessLint: {
        ok: false,
        findings: {
          high: [],
          medium: [
            expect.objectContaining({
              code: "GIT_CHECKPOINT_POLICY_NOT_ENFORCED",
              path: "okfh.config.yaml",
            }),
          ],
          low: [],
        },
      },
    });
  });

  it("reports broken internal links as low-priority Harness lint", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "---\ntype: Topic\ntitle: LLM Wiki\n---\n# Overview\n\nSee [Missing](/topics/missing.md).\n\n# Citations\n\n- /references/karpathy-llm-wiki.md\n",
      "utf8",
    );

    const result = await checkWorkspace(workspaceRoot);

    expect(result).toMatchObject({
      status: "needs_attention",
      okfConformance: {
        ok: true,
        findings: [],
      },
      harnessLint: {
        ok: false,
        findings: {
          high: [],
          medium: [],
          low: [
            expect.objectContaining({
              code: "BROKEN_LINK",
              path: "wiki/topics/llm-wiki.md",
            }),
          ],
        },
      },
    });
  });

  it("reports missing citations as medium-priority Harness lint", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "---\ntype: Topic\ntitle: LLM Wiki\n---\n# Overview\n\nA topic without citations.\n",
      "utf8",
    );

    const result = await checkWorkspace(workspaceRoot);

    expect(result).toMatchObject({
      status: "needs_attention",
      okfConformance: {
        ok: true,
        findings: [],
      },
      harnessLint: {
        ok: false,
        findings: {
          high: [],
          medium: [
            expect.objectContaining({
              code: "MISSING_CITATIONS_SECTION",
              path: "wiki/topics/llm-wiki.md",
            }),
          ],
          low: [],
        },
      },
    });
  });

  it("reports malformed source manifests as high-priority Harness lint", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await mkdir(`${workspaceRoot}/.okfh`, { recursive: true });
    await writeFile(`${workspaceRoot}/.okfh/manifest.jsonl`, "not-json\n", "utf8");

    const result = await checkWorkspace(workspaceRoot);

    expect(result).toMatchObject({
      status: "needs_attention",
      currency: {
        sealed: false,
        dangling: [],
        diagnostics: [
          expect.objectContaining({
            code: "MANIFEST_INVALID",
            path: ".okfh/manifest.jsonl",
          }),
        ],
      },
      okfConformance: {
        ok: true,
        findings: [],
      },
      harnessLint: {
        ok: false,
        findings: {
          high: [
            expect.objectContaining({
              code: "MANIFEST_INVALID",
              path: ".okfh/manifest.jsonl",
            }),
          ],
          medium: [],
          low: [],
        },
      },
    });
  });

  it("does not seal currency when the reconciliation ledger is invalid", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await mkdir(`${workspaceRoot}/.okfh`, { recursive: true });
    await writeFile(`${workspaceRoot}/.okfh/reconciliation.jsonl`, "{not json}\n", "utf8");

    const result = await checkWorkspace(workspaceRoot);

    expect(result.status).toBe("needs_attention");
    expect(result.currency).toEqual({
      sealed: false,
      dangling: [],
      diagnostics: [
        expect.objectContaining({
          code: "RECONCILIATION_LEDGER_INVALID",
          path: ".okfh/reconciliation.jsonl",
          line: 1,
        }),
      ],
    });
  });

  it("does not seal currency when config, manifest, or ledger files cannot be read", async () => {
    const cases = [
      { path: "okfh.config.yaml", code: "CONFIG_INVALID" },
      { path: ".okfh/manifest.jsonl", code: "MANIFEST_INVALID" },
      { path: ".okfh/reconciliation.jsonl", code: "RECONCILIATION_LEDGER_INVALID" },
    ];

    for (const testCase of cases) {
      const workspaceRoot = await copyValidWorkspace();
      await rm(`${workspaceRoot}/${testCase.path}`, { recursive: true, force: true });
      await mkdir(`${workspaceRoot}/${testCase.path}`, { recursive: true });

      const result = await checkWorkspace(workspaceRoot);

      expect(result.currency).toEqual({
        sealed: false,
        dangling: [],
        diagnostics: [expect.objectContaining({ code: testCase.code, path: testCase.path })],
      });
    }
  });

  it("preserves OKF failures when another currency input is unreadable", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "# Overview\nMissing frontmatter.\n",
      "utf8",
    );
    await mkdir(`${workspaceRoot}/.okfh/reconciliation.jsonl`);

    const result = await checkWorkspace(workspaceRoot);

    expect(result.status).toBe("blocked");
    expect(result.okfConformance.findings).toContainEqual(
      expect.objectContaining({ code: "OKF_MISSING_FRONTMATTER" }),
    );
    expect(result.currency.sealed).toBe(false);
    expect(result.currency.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "OKF_MISSING_FRONTMATTER" }),
        expect.objectContaining({ code: "RECONCILIATION_LEDGER_INVALID" }),
      ]),
    );
  });

  it("does not seal currency when the wiki cannot be scanned", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await rm(`${workspaceRoot}/wiki`, { recursive: true });
    await writeFile(`${workspaceRoot}/wiki`, "not a directory\n", "utf8");

    const result = await checkWorkspace(workspaceRoot);

    expect(result.status).toBe("needs_attention");
    expect(result.currency).toEqual({
      sealed: false,
      dangling: [],
      diagnostics: [expect.objectContaining({ code: "SCAN_FAILED", path: "wiki" })],
    });
    expect(result.harnessLint.findings.medium).toContainEqual(
      expect.objectContaining({ code: "SCAN_FAILED", path: "wiki" }),
    );
  });

  it("does not seal currency when reference linkage is invalid", async () => {
    const malformedRoot = await copyValidWorkspace();
    await writeFile(
      `${malformedRoot}/wiki/references/malformed.md`,
      "---\ntitle: [unterminated\n---\n# Malformed\n",
      "utf8",
    );

    const malformed = await checkWorkspace(malformedRoot);
    expect(malformed.currency).toEqual({
      sealed: false,
      dangling: [],
      diagnostics: [
        expect.objectContaining({
          code: "OKF_INVALID_FRONTMATTER",
          path: "wiki/references/malformed.md",
        }),
      ],
    });

    const missingRoot = await copyValidWorkspace();
    await writeFile(
      `${missingRoot}/wiki/references/unregistered.md`,
      "---\ntype: Reference\ntitle: Unregistered\nokfh:\n  source_id: src_20260615_9999\n---\n# Unregistered\n",
      "utf8",
    );

    const missing = await checkWorkspace(missingRoot);
    expect(missing.currency).toEqual({
      sealed: false,
      dangling: [],
      diagnostics: [
        expect.objectContaining({
          code: "REFERENCE_SOURCE_MISSING",
          path: "wiki/references/unregistered.md",
        }),
      ],
    });
  });
});
