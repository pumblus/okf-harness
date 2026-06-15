import { describe, expect, it } from "vitest";
import { loadWorkspaceConfig } from "../src/config/index.js";
import { conceptIdFromPath, scanConcepts } from "../src/okf/concepts.js";
import { parseMarkdownFrontmatter } from "../src/okf/frontmatter.js";
import { validWorkspaceFixture } from "./helpers.js";

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
  });
});
