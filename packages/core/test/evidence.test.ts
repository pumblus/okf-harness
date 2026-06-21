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

  it("keeps matching candidates thin and score-free", async () => {
    const result = await planEvidenceBrief({
      workspaceRoot: validWorkspaceFixture,
      question: "LLM Wiki",
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
    expect(JSON.stringify(result)).not.toMatch(/\b(score|confidence|relevance|ranking)\b/i);
    expect(JSON.stringify(result)).not.toContain("Fixture raw source for the LLM Wiki pattern.");
  });
});
