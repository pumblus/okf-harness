import { describe, expect, it } from "vitest";
import { planEvidenceBrief } from "../src/evidence/index.js";
import { validWorkspaceFixture } from "./helpers.js";

describe("OKF evidence brief planning", () => {
  it("treats no matching evidence as a successful brief result", async () => {
    const result = await planEvidenceBrief({
      workspaceRoot: validWorkspaceFixture,
      question: "zqxjv noremote",
    });

    expect(result).toMatchObject({
      workspaceRoot: validWorkspaceFixture,
      question: "zqxjv noremote",
      evidence: [],
      candidates: [],
      limits: [
        {
          code: "NO_MATCHES",
        },
      ],
      warnings: [],
    });
    expect(result.guidance.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(/\b(score|confidence|relevance|ranking)\b/i);
    expect(JSON.stringify(result)).not.toContain("Fixture raw source for the LLM Wiki pattern.");
  });

  it("returns section-first evidence items for matching wiki questions", async () => {
    const result = await planEvidenceBrief({
      workspaceRoot: validWorkspaceFixture,
      question: "LLM Wiki",
    });

    expect(result.evidence[0]).toMatchObject({
      item: 1,
      conceptId: "topics/llm-wiki",
      path: "wiki/topics/llm-wiki.md",
      title: "LLM Wiki",
      type: "Topic",
      section: {
        sectionId: "overview",
        heading: "Overview",
        headingPath: ["Overview"],
        level: 1,
      },
      range: {
        mode: "section",
        startOffset: expect.any(Number),
        endOffset: expect.any(Number),
        contentLength: expect.any(Number),
        returnedChars: expect.any(Number),
        truncated: false,
      },
      excerpt: expect.stringContaining("An LLM Wiki keeps raw sources separate"),
      matchedFields: expect.arrayContaining(["title"]),
      matchReasons: expect.arrayContaining(["title phrase match", "section body match: Overview"]),
      provenance: {
        citations: expect.arrayContaining([
          expect.objectContaining({
            kind: "reference",
            target: "/references/karpathy-llm-wiki.md",
            exists: true,
          }),
        ]),
        citationIssues: [],
      },
    });
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        item: 1,
        conceptId: "topics/llm-wiki",
        path: "wiki/topics/llm-wiki.md",
        matchedFields: expect.arrayContaining(["title"]),
        matchReasons: expect.arrayContaining(["title phrase match"]),
      }),
    );
    expect(result.candidates[0]).not.toHaveProperty("excerpt");
    expect(JSON.stringify(result)).not.toMatch(/\b(score|confidence|relevance|ranking)\b/i);
    expect(JSON.stringify(result)).not.toContain("Fixture raw source for the LLM Wiki pattern.");
  });

  it("does not report navigation or unhit sections as match reasons", async () => {
    const result = await planEvidenceBrief({
      workspaceRoot: validWorkspaceFixture,
      question: "Local markdown bundle maintained by an agent",
    });

    expect(result.evidence[0]).toMatchObject({
      conceptId: "topics/llm-wiki",
      matchedFields: ["description"],
      matchReasons: expect.arrayContaining(["description phrase match"]),
    });
    expect(result.evidence[0]?.matchReasons).not.toContain("index link match");
    expect(result.evidence[0]?.matchReasons).not.toContain("section body match: Overview");
    expect(result.candidates[0]?.matchReasons).not.toContain("index link match");
  });
});
