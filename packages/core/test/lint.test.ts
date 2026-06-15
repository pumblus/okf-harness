import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { lintWorkspace } from "../src/lint/index.js";
import { copyValidWorkspace, validWorkspaceFixture } from "./helpers.js";

describe("OKF hard linter", () => {
  it("passes the valid fixture workspace", async () => {
    const result = await lintWorkspace(validWorkspaceFixture);

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("reports missing frontmatter on non-reserved concept files", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "# Overview\nMissing frontmatter.\n",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "OKF_MISSING_FRONTMATTER",
        path: "wiki/topics/llm-wiki.md",
      }),
    ]);
  });

  it("reports missing type on non-reserved concept files", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      `${workspaceRoot}/wiki/topics/llm-wiki.md`,
      "---\ntitle: LLM Wiki\n---\n# Overview\n",
    );

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "OKF_MISSING_TYPE",
        path: "wiki/topics/llm-wiki.md",
      }),
    ]);
  });

  it("reports concept frontmatter on reserved files", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(`${workspaceRoot}/wiki/index.md`, "---\ntype: Topic\n---\n# Index\n");

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "RESERVED_FILE_HAS_CONCEPT_FRONTMATTER",
        path: "wiki/index.md",
      }),
    ]);
  });

  it("reports invalid log date headings", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(`${workspaceRoot}/wiki/log.md`, "# Log\n\n## June 15\n");

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "LOG_INVALID_DATE_HEADING",
        line: 3,
        path: "wiki/log.md",
      }),
    ]);
  });

  it("reports invalid date headings in nested log files", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(`${workspaceRoot}/wiki/references/log.md`, "# Reference Log\n\n## June 15\n");

    const result = await lintWorkspace(workspaceRoot);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "LOG_INVALID_DATE_HEADING",
        line: 3,
        path: "wiki/references/log.md",
      }),
    ]);
  });
});
