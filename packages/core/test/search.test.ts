import { describe, expect, it } from "vitest";
import { searchWorkspace } from "../src/search/index.js";
import { validWorkspaceFixture } from "./helpers.js";

describe("OKF deterministic search", () => {
  it("returns thin candidate cards for synthesized wiki concepts", async () => {
    const result = await searchWorkspace({
      workspaceRoot: validWorkspaceFixture,
      query: "LLM Wiki",
    });

    expect(result).toMatchObject({
      workspaceRoot: validWorkspaceFixture,
      query: "LLM Wiki",
      filtersApplied: {},
      limit: 10,
      totalMatches: 2,
      truncated: false,
      warnings: [],
      results: [
        {
          conceptId: "topics/llm-wiki",
          path: "wiki/topics/llm-wiki.md",
          title: "LLM Wiki",
          type: "Topic",
          tags: ["llm-wiki", "okf"],
          description: "Local markdown bundle maintained by an agent.",
          frontmatterOk: true,
          indexMentioned: true,
          matchedFields: expect.arrayContaining(["title", "path", "body"]),
          bodyHitCount: 1,
        },
        {
          conceptId: "references/karpathy-llm-wiki",
          path: "wiki/references/karpathy-llm-wiki.md",
          type: "Reference",
          frontmatterOk: true,
          indexMentioned: true,
        },
      ],
    });
    expect(result.results[0]).not.toHaveProperty("body");
    expect(result.results[0]).not.toHaveProperty("snippet");
    expect(result.results[0]?.score).toBeGreaterThan(0);
    expect(result.results[0]?.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "title" }),
        expect.objectContaining({ field: "body" }),
      ]),
    );
  });

  it("applies field filters and explicit limits", async () => {
    const result = await searchWorkspace({
      workspaceRoot: validWorkspaceFixture,
      query: "LLM type:Reference",
      limit: 1,
    });

    expect(result).toMatchObject({
      filtersApplied: { type: "Reference" },
      limit: 1,
      totalMatches: 1,
      truncated: false,
      results: [
        expect.objectContaining({
          conceptId: "references/karpathy-llm-wiki",
          type: "Reference",
        }),
      ],
    });
  });
});
