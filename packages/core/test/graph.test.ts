import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorkspaceGraph } from "../src/graph/index.js";
import { copyValidWorkspace } from "./helpers.js";

describe("OKF graph builder", () => {
  it("writes backlinks data and a self-contained graph report", async () => {
    const workspaceRoot = await copyValidWorkspace();

    const result = await buildWorkspaceGraph({ workspaceRoot });

    expect(result).toMatchObject({
      workspaceRoot,
      report: {
        backlinksPath: path.join(workspaceRoot, ".okfh/backlinks.json"),
        htmlPath: path.join(workspaceRoot, ".okfh/reports/graph.html"),
      },
      stats: {
        nodes: 2,
        conceptEdges: 0,
        evidenceEdges: 1,
      },
      issues: [],
      missingTargets: [],
    });
    expect(result).not.toHaveProperty("nodes");
    expect(result).not.toHaveProperty("edges");

    const backlinks = JSON.parse(
      await readFile(path.join(workspaceRoot, ".okfh/backlinks.json"), "utf8"),
    );
    expect(backlinks).toMatchObject({
      nodes: [
        expect.objectContaining({ id: "references/karpathy-llm-wiki", type: "Reference" }),
        expect.objectContaining({ id: "topics/llm-wiki", type: "Topic" }),
      ],
      edges: [
        {
          from: "topics/llm-wiki",
          to: "references/karpathy-llm-wiki",
          kind: "citation",
        },
      ],
    });

    const html = await readFile(path.join(workspaceRoot, ".okfh/reports/graph.html"), "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("topics/llm-wiki");
    expect(html).not.toContain("https://");
    await expect(stat(path.join(workspaceRoot, ".okfh/reports/graph.html"))).resolves.toBeTruthy();
  });

  it("builds graph edges from relative OKF markdown links", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await writeFile(
      path.join(workspaceRoot, "wiki/topics/related.md"),
      "---\ntype: Topic\ntitle: Related\n---\n# Overview\n\nSee [LLM Wiki](./llm-wiki.md).\n\n# Citations\n\n- /references/karpathy-llm-wiki.md\n",
      "utf8",
    );

    await buildWorkspaceGraph({ workspaceRoot });

    const backlinks = JSON.parse(
      await readFile(path.join(workspaceRoot, ".okfh/backlinks.json"), "utf8"),
    );
    expect(backlinks.edges).toEqual(
      expect.arrayContaining([
        {
          from: "topics/related",
          to: "topics/llm-wiki",
          kind: "link",
        },
      ]),
    );
  });
});
