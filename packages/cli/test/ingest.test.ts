import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli ingest", () => {
  it("creates a metadata-level ingest plan for a registered source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    await writeFile(
      path.join(workspace, "wiki/topics/llm-wiki.md"),
      "---\ntype: topic\ntitle: LLM Wiki\ntags: [llm, wiki]\n---\n# LLM Wiki\n",
      "utf8",
    );
    const sourcePath = path.join(root, "llm-wiki-paper.md");
    await writeFile(sourcePath, "# Source body is for the Agent, not the plan.\n", "utf8");
    const added = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);

    const plan = await runJsonCli([
      "node",
      "okfh",
      "ingest",
      "plan",
      added.result.data.source.id,
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(plan).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "ingest plan",
        workspace,
        data: {
          source: {
            id: added.result.data.source.id,
            path: added.result.data.source.path,
          },
          recommendedReferencePath: "wiki/references/llm-wiki-paper.md",
          candidateConcepts: [
            expect.objectContaining({
              id: "topics/llm-wiki",
              path: "wiki/topics/llm-wiki.md",
              reason: expect.stringContaining("metadata"),
            }),
          ],
          checklist: expect.arrayContaining([
            expect.stringContaining("Read the full registered source"),
            expect.stringContaining("Run okfh check --workspace <workspace> --json"),
          ]),
        },
        warnings: [],
      },
    });
  });
});
