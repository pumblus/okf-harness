import { mkdir, rm, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkWorkspace } from "../src/check/index.js";
import { addSource } from "../src/source/index.js";
import { copyValidWorkspace, validWorkspaceFixture } from "./helpers.js";

describe("OKF workspace check", () => {
  it("reports a valid workspace as ready", async () => {
    const result = await checkWorkspace(validWorkspaceFixture);

    expect(result).toEqual({
      status: "ready",
      okfVersion: "0.1",
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
});
