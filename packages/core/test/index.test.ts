import { describe, expect, it } from "vitest";
import { packageInfo } from "../src/index.js";
import { createWorkspacePlan } from "../src/workspace/index.js";

describe("@okf-harness/core", () => {
  it("exposes core package metadata", () => {
    expect(packageInfo).toEqual({
      name: "@okf-harness/core",
      role: "core",
    });
  });

  it("creates the workspace plan used by dry-run and init", () => {
    const plan = createWorkspacePlan({
      name: "AI Research",
      now: new Date("2026-06-15T12:00:00.000Z"),
    });

    expect(plan).toMatchObject({
      name: "AI Research",
      createdAt: "2026-06-15T12:00:00.000Z",
      directories: expect.arrayContaining([".agents/skills", "raw/sources", "wiki/topics"]),
      files: expect.arrayContaining([
        expect.objectContaining({ path: "okfh.config.yaml" }),
        expect.objectContaining({ path: "AGENTS.md" }),
        expect.objectContaining({ path: "CLAUDE.md" }),
        expect.objectContaining({
          path: ".gitignore",
          contents: expect.stringContaining(".okfh/reports/graph.html"),
        }),
        expect.objectContaining({ path: "wiki/index.md" }),
      ]),
      warnings: [],
    });
  });
});
