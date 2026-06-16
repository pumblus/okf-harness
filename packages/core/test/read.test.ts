import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readWorkspaceDocument } from "../src/read/index.js";
import { copyValidWorkspace, validWorkspaceFixture } from "./helpers.js";

describe("OKF bounded read", () => {
  it("reads a concept document with metadata, outline, links, citations, and bounded content", async () => {
    const result = await readWorkspaceDocument({
      workspaceRoot: validWorkspaceFixture,
      target: "topics/llm-wiki",
    });

    expect(result).toMatchObject({
      workspaceRoot: validWorkspaceFixture,
      target: {
        input: "topics/llm-wiki",
        conceptId: "topics/llm-wiki",
        path: "wiki/topics/llm-wiki.md",
        reserved: false,
      },
      frontmatter: {
        ok: true,
        data: {
          type: "Topic",
          title: "LLM Wiki",
        },
      },
      metadata: {
        title: "LLM Wiki",
        type: "Topic",
        tags: ["llm-wiki", "okf"],
      },
      outline: expect.arrayContaining([
        expect.objectContaining({ heading: "Overview", level: 1 }),
        expect.objectContaining({ heading: "Citations", level: 1 }),
      ]),
      availableSections: expect.arrayContaining([
        expect.objectContaining({ heading: "Overview", sectionId: "overview" }),
      ]),
      links: [],
      citations: [
        expect.objectContaining({
          kind: "reference",
          target: "/references/karpathy-llm-wiki.md",
          conceptId: "references/karpathy-llm-wiki",
          exists: true,
        }),
      ],
      citationIssues: [],
      content: {
        mode: "preview",
        startOffset: 0,
        contentLength: expect.any(Number),
        returnedChars: expect.any(Number),
        truncated: false,
      },
    });
    expect(result.content.text).toContain("An LLM Wiki keeps raw sources separate");
    expect(result).not.toHaveProperty("body");
    expect(result).not.toHaveProperty("bodyPreview");
    expect(result).not.toHaveProperty("fullText");
  });

  it("supports section reads, reserved index navigation, and reference source metadata", async () => {
    const section = await readWorkspaceDocument({
      workspaceRoot: validWorkspaceFixture,
      target: "wiki/topics/llm-wiki.md",
      section: "Citations",
    });
    expect(section.content).toMatchObject({
      mode: "section",
      truncated: false,
    });
    expect(section.content.text).toContain("/references/karpathy-llm-wiki.md");
    expect(section.content.text).not.toContain("keeps raw sources separate");

    const index = await readWorkspaceDocument({
      workspaceRoot: validWorkspaceFixture,
      target: "index",
    });
    expect(index.target).toMatchObject({
      conceptId: "index",
      reserved: true,
      path: "wiki/index.md",
    });
    expect(index.indexLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "LLM Wiki",
          conceptId: "topics/llm-wiki",
          exists: true,
        }),
      ]),
    );

    const reference = await readWorkspaceDocument({
      workspaceRoot: validWorkspaceFixture,
      target: "/references/karpathy-llm-wiki.md",
    });
    expect(reference.source).toMatchObject({
      id: "src_20260615_0001",
      path: "raw/sources/2026/06/karpathy-llm-wiki.md",
    });
    expect(reference.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "source",
          sourceId: "src_20260615_0001",
          exists: true,
        }),
      ]),
    );
  });

  it("does not expose top-level source metadata for non-reference documents", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "---\ntype: Topic\ntitle: LLM Wiki\nokfh:\n  source_id: src_20260615_0001\n---\n# Overview\n\nTopic synthesis.\n\n# Citations\n\n- src_20260615_0001\n",
      "utf8",
    );

    const result = await readWorkspaceDocument({
      workspaceRoot,
      target: "topics/llm-wiki",
    });

    expect(result.source).toBeUndefined();
    expect(result.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "source",
          sourceId: "src_20260615_0001",
          exists: true,
        }),
      ]),
    );
  });

  it("rejects explicit full reads above the hard cap", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      `---\ntype: Topic\ntitle: LLM Wiki\n---\n# Overview\n\n${"Long body.\n".repeat(12_000)}\n# Citations\n\n- /references/karpathy-llm-wiki.md\n`,
      "utf8",
    );

    await expect(
      readWorkspaceDocument({
        workspaceRoot,
        target: "topics/llm-wiki",
        full: true,
      }),
    ).rejects.toMatchObject({
      code: "READ_LIMIT_EXCEEDED",
    });
  });

  it("rejects non-UTF-8 markdown targets", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      Buffer.from([
        ...Buffer.from("---\ntype: Topic\ntitle: LLM Wiki\n---\n# Overview\n\n"),
        0xff,
        0xfe,
      ]),
    );

    await expect(
      readWorkspaceDocument({
        workspaceRoot,
        target: "topics/llm-wiki",
      }),
    ).rejects.toMatchObject({
      code: "NON_UTF8_TARGET",
    });
  });
});
