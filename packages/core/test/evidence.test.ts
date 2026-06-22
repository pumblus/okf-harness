import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
      budget: {
        preset: "standard",
        maxChars: 400_000,
        override: false,
        usedChars: 0,
      },
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
        references: [
          expect.objectContaining({
            target: "/references/karpathy-llm-wiki.md",
            exists: true,
            conceptId: "references/karpathy-llm-wiki",
            sourceIds: ["src_20260615_0001"],
            sources: [
              expect.objectContaining({
                id: "src_20260615_0001",
                kind: "file",
                path: "raw/sources/2026/06/karpathy-llm-wiki.md",
                sha256: "09ff0b6de0a595bec1b6b28686f23ee399853cbe05cf46a8818d2e9b1df59626",
              }),
            ],
            citationIssues: [],
          }),
        ],
        sourceIds: ["src_20260615_0001"],
        sources: [
          expect.objectContaining({
            id: "src_20260615_0001",
            original: "karpathy-llm-wiki.md",
            title: "karpathy-llm-wiki",
          }),
        ],
      },
    });
    expect(result.candidates).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/\b(score|confidence|relevance|ranking)\b/i);
    expect(JSON.stringify(result)).not.toContain("Fixture raw source for the LLM Wiki pattern.");
  });

  it("surfaces citation issues without expanding raw source bodies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-evidence-"));
    const workspace = path.join(root, "workspace");
    await cp(validWorkspaceFixture, workspace, { recursive: true });
    try {
      await writeFile(
        path.join(workspace, "wiki/topics/llm-wiki.md"),
        `---
type: Topic
title: LLM Wiki
description: Local markdown bundle maintained by an agent.
tags: [llm-wiki, okf]
timestamp: "2026-06-15T12:00:00-07:00"
---

# Overview

An LLM Wiki keeps raw sources separate from synthesized concept pages.

# Citations

- [missing reference](/references/missing.md)
`,
        "utf8",
      );

      const result = await planEvidenceBrief({
        workspaceRoot: workspace,
        question: "LLM Wiki",
      });

      expect(result.evidence[0]?.provenance).toMatchObject({
        citationIssues: [
          {
            code: "BROKEN_CITATION_REFERENCE",
            message: "Citation reference does not resolve: /references/missing.md",
          },
        ],
        references: [
          {
            target: "/references/missing.md",
            exists: false,
            sourceIds: [],
            sources: [],
            citationIssues: [],
          },
        ],
        sourceIds: [],
        sources: [],
      });
      expect(result.limits).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "WORKSPACE_RISK" })]),
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "BROKEN_LINK" })]),
      );
      expect(JSON.stringify(result)).not.toContain("Fixture raw source for the LLM Wiki pattern.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns readable evidence with source-integrity lint risk", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-evidence-"));
    const workspace = path.join(root, "workspace");
    await cp(validWorkspaceFixture, workspace, { recursive: true });
    try {
      await writeFile(
        path.join(workspace, "raw/sources/2026/06/karpathy-llm-wiki.md"),
        "# Changed source\n",
        "utf8",
      );

      const result = await planEvidenceBrief({
        workspaceRoot: workspace,
        question: "LLM Wiki",
      });

      expect(result.evidence[0]?.conceptId).toBe("topics/llm-wiki");
      expect(result.limits).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "WORKSPACE_RISK" })]),
      );
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "SOURCE_HASH_DRIFT",
            priority: "high",
          }),
        ]),
      );
      expect(JSON.stringify(result)).not.toContain("# Changed source");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns selected evidence plus additional thin candidates in the same brief", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-evidence-"));
    const workspace = path.join(root, "workspace");
    await cp(validWorkspaceFixture, workspace, { recursive: true });
    try {
      for (const suffix of ["a", "b", "c", "d", "e"]) {
        await writeFile(
          path.join(workspace, `wiki/topics/candidate-proof-${suffix}.md`),
          `---
type: Topic
title: Candidate Proof ${suffix.toUpperCase()}
description: Candidate Proof matching fixture.
tags: [candidate-proof]
timestamp: "2026-06-15T12:00:00-07:00"
---

# Overview

Candidate Proof ${suffix.toUpperCase()} keeps candidate cards thin.
`,
          "utf8",
        );
      }

      const result = await planEvidenceBrief({
        workspaceRoot: workspace,
        question: "Candidate Proof",
      });

      expect(result.evidence.map((item) => [item.item, item.conceptId])).toEqual([
        [1, "topics/candidate-proof-a"],
        [2, "topics/candidate-proof-b"],
        [3, "topics/candidate-proof-c"],
      ]);
      expect(result.candidates).toEqual([
        expect.objectContaining({
          item: 4,
          conceptId: "topics/candidate-proof-d",
          path: "wiki/topics/candidate-proof-d.md",
          title: "Candidate Proof D",
          type: "Topic",
          matchedFields: expect.arrayContaining(["title"]),
          matchReasons: expect.arrayContaining(["title phrase match"]),
        }),
        expect.objectContaining({
          item: 5,
          conceptId: "topics/candidate-proof-e",
          path: "wiki/topics/candidate-proof-e.md",
          title: "Candidate Proof E",
          type: "Topic",
          matchedFields: expect.arrayContaining(["title"]),
          matchReasons: expect.arrayContaining(["title phrase match"]),
        }),
      ]);
      expect(result.evidence[0]?.excerpt).toContain(
        "Candidate Proof A keeps candidate cards thin.",
      );
      for (const candidate of result.candidates) {
        expect(candidate).not.toHaveProperty("excerpt");
      }
      expect(JSON.stringify(result.candidates)).not.toContain("keeps candidate cards thin.");
      expect(JSON.stringify(result.candidates)).not.toMatch(
        /\b(score|confidence|relevance|ranking)\b/i,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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
    expect(result.candidates).toEqual([]);
  });

  it("bounds large evidence pages and returns continuation cues", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-evidence-"));
    const workspace = path.join(root, "workspace");
    await cp(validWorkspaceFixture, workspace, { recursive: true });
    try {
      await writeFile(
        path.join(workspace, "wiki/topics/llm-wiki.md"),
        `---
type: Topic
title: Budget Proof
description: Large evidence budget fixture.
tags: [budget]
timestamp: "2026-06-15T12:00:00-07:00"
---

# Budget Proof

budget proof ${"large page ".repeat(10_000)}

# Citations

- /references/karpathy-llm-wiki.md
`,
        "utf8",
      );

      const result = await planEvidenceBrief({
        workspaceRoot: workspace,
        question: "Budget Proof",
        maxChars: 120,
      });
      const returnedChars = result.evidence.reduce(
        (total, item) => total + item.range.returnedChars,
        0,
      );
      const item = result.evidence[0];

      expect(result.budget).toEqual({
        preset: "standard",
        maxChars: 120,
        override: true,
        usedChars: returnedChars,
      });
      expect(returnedChars).toBeLessThanOrEqual(120);
      expect(item).toMatchObject({
        conceptId: "topics/llm-wiki",
        range: {
          mode: "range",
          contentLength: expect.any(Number),
          returnedChars: 120,
          truncated: true,
        },
        continuationCues: [
          {
            target: "topics/llm-wiki",
            offset: expect.any(Number),
            limit: 120,
          },
        ],
      });
      expect(item?.continuationCues[0]?.command).toBe(
        `okfh read 'topics/llm-wiki' --workspace '${workspace}' --offset ${item?.range.endOffset} --limit 120 --json`,
      );
      expect(JSON.stringify(result).length).toBeLessThan(5_000);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("quotes continuation commands for workspace and concept paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-evidence-"));
    const workspace = path.join(root, "workspace with space");
    await cp(validWorkspaceFixture, workspace, { recursive: true });
    try {
      await writeFile(
        path.join(workspace, "wiki/topics/space proof.md"),
        `---
type: Topic
title: Space Proof
description: Space path proof.
tags: [space]
timestamp: "2026-06-15T12:00:00-07:00"
---

# Space Proof

space proof ${"large page ".repeat(1_000)}
`,
        "utf8",
      );

      const result = await planEvidenceBrief({
        workspaceRoot: workspace,
        question: "Space Proof",
        maxChars: 80,
      });
      const item = result.evidence[0];

      expect(item).toMatchObject({
        conceptId: "topics/space proof",
        range: {
          truncated: true,
        },
      });
      expect(item?.continuationCues[0]?.command).toBe(
        `okfh read 'topics/space proof' --workspace '${workspace}' --offset ${item?.range.endOffset} --limit 80 --json`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails clearly when the OKF wiki cannot be scanned", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-evidence-"));
    const workspace = path.join(root, "workspace");
    await cp(validWorkspaceFixture, workspace, { recursive: true });
    await rm(path.join(workspace, "wiki"), { recursive: true, force: true });
    try {
      await expect(
        planEvidenceBrief({
          workspaceRoot: workspace,
          question: "LLM Wiki",
        }),
      ).rejects.toMatchObject({
        code: "SCAN_FAILED",
        message: expect.stringContaining("no such file or directory"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
