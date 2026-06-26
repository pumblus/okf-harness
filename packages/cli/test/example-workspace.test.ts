import path from "node:path";
import { describe, expect, it } from "vitest";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli example workspace", () => {
  const workspace = path.resolve("examples/ai-research-workspace");
  const firstAnswerQuestion =
    "What is this source mainly about? What are its key conclusions? Where does the evidence come from?";

  it("proves the first useful loop acceptance path", async () => {
    const check = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);

    expect(check).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "check",
        workspace,
        data: {
          status: "ready",
          okfConformance: {
            ok: true,
            findings: [],
          },
          harnessLint: {
            ok: true,
            findings: {
              high: [],
              medium: [],
              low: [],
            },
          },
        },
      },
    });

    const evidence = await runJsonCli([
      "node",
      "okfh",
      "evidence",
      firstAnswerQuestion,
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(evidence).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "evidence",
        workspace,
        data: {
          question: firstAnswerQuestion,
          evidence: expect.arrayContaining([
            expect.objectContaining({
              conceptId: "references/llm-wiki-field-note",
              path: "wiki/references/llm-wiki-field-note.md",
              provenance: expect.objectContaining({
                sourceIds: ["src_20260616_0001"],
              }),
            }),
            expect.objectContaining({
              conceptId: "topics/llm-wiki",
              path: "wiki/topics/llm-wiki.md",
            }),
          ]),
          limits: [],
        },
        warnings: [],
      },
    });
    expect(JSON.stringify(evidence.result)).not.toContain(
      "This synthetic note is a small example source",
    );
  });
});
