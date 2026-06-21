import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadWorkspaceConfig } from "../src/config/index.js";
import { conceptIdFromPath, scanConcepts } from "../src/okf/concepts.js";
import { okfDocumentView } from "../src/okf/document.js";
import { parseMarkdownFrontmatter } from "../src/okf/frontmatter.js";
import { copyValidWorkspace, validWorkspaceFixture } from "./helpers.js";

describe("OKF markdown parsing", () => {
  it("parses YAML frontmatter and body content", () => {
    const parsed = parseMarkdownFrontmatter("---\ntype: Topic\ntags: [okf]\n---\n# Body\n");

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.type).toBe("Topic");
      expect(parsed.data.tags).toEqual(["okf"]);
      expect(parsed.body.trim()).toBe("# Body");
    }
  });

  it("distinguishes missing and invalid frontmatter", () => {
    expect(parseMarkdownFrontmatter("# Body\n")).toMatchObject({
      ok: false,
      error: "missing",
    });
    expect(parseMarkdownFrontmatter("---\ntype: [\n---\n")).toMatchObject({
      ok: false,
      error: "invalid",
    });
  });

  it("describes OKF document metadata and body without changing the bundle shape", () => {
    const markdown =
      '---\ntype: Topic\ntitle: Example\ndescription: Test page\ntags: [okf]\ntimestamp: "2026-06-15T12:00:00Z"\n---\n# Body\n';

    expect(
      okfDocumentView({
        absolutePath: "/workspace/wiki/topics/example.md",
        workspacePath: "wiki/topics/example.md",
        bundlePath: "topics/example.md",
        conceptId: "topics/example",
        isReserved: false,
        markdown,
        frontmatter: parseMarkdownFrontmatter(markdown),
      }),
    ).toMatchObject({
      title: "Example",
      type: "Topic",
      description: "Test page",
      tags: ["okf"],
      timestamp: "2026-06-15T12:00:00Z",
      body: "# Body\n",
      frontmatterOk: true,
    });
  });
});

describe("OKF concept scanning", () => {
  it("derives concept IDs from bundle-relative markdown paths", () => {
    expect(conceptIdFromPath("topics/llm-wiki.md")).toBe("topics/llm-wiki");
    expect(conceptIdFromPath("wiki/references/source.md")).toBe("references/source");
  });

  it("scans non-reserved concept files and skips index/log files", async () => {
    const config = await loadWorkspaceConfig(validWorkspaceFixture);
    const result = await scanConcepts(validWorkspaceFixture, config);

    expect(result.files.map((file) => file.bundlePath)).toEqual([
      "index.md",
      "log.md",
      "references/index.md",
      "references/karpathy-llm-wiki.md",
      "topics/llm-wiki.md",
    ]);
    expect(result.concepts.map((concept) => concept.id)).toEqual([
      "references/karpathy-llm-wiki",
      "topics/llm-wiki",
    ]);
    expect(result.concepts.find((concept) => concept.id === "topics/llm-wiki")).toMatchObject({
      type: "Topic",
      title: "LLM Wiki",
      description: "Local markdown bundle maintained by an agent.",
      tags: ["llm-wiki", "okf"],
      body: expect.stringContaining("# Overview"),
    });
  });

  it("keeps display fallback titles out of scanned concept metadata", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/heading-only.md`,
      "---\ntype: Topic\n---\n# Heading Only\n",
      "utf8",
    );
    const config = await loadWorkspaceConfig(workspaceRoot);
    const result = await scanConcepts(workspaceRoot, config);

    expect(result.concepts.find((concept) => concept.id === "topics/heading-only")).toMatchObject({
      type: "Topic",
      tags: [],
      body: "# Heading Only\n",
    });
    expect(result.concepts.find((concept) => concept.id === "topics/heading-only")?.title).toBe(
      undefined,
    );
  });
});
