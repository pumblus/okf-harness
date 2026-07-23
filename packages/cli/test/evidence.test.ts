import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli evidence", () => {
  it("returns seals through JSON and human output without failing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await cp(path.resolve("packages/core/test/fixtures/valid-workspace"), workspace, {
      recursive: true,
    });
    await rm(path.join(workspace, "raw/sources/2026/06/karpathy-llm-wiki.md"));

    try {
      const json = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "LLM Wiki",
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(json).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "evidence",
          data: {
            evidence: [],
            candidates: [],
            seals: [
              {
                code: "SOURCE_MISSING",
                sourceId: "src_20260615_0001",
                sourcePath: "raw/sources/2026/06/karpathy-llm-wiki.md",
                sealed: ["references/karpathy-llm-wiki", "topics/llm-wiki"],
                basis: expect.stringContaining("Registered source is missing"),
              },
            ],
          },
        },
      });
      expect(json.result.data.limits).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "WORKSPACE_RISK" })]),
      );

      let stdout = "";
      let stderr = "";
      const exitCode = await runCli(
        ["node", "okfh", "evidence", "LLM Wiki", "--workspace", workspace],
        {
          writeOut: (chunk) => {
            stdout += chunk;
          },
          writeErr: (chunk) => {
            stderr += chunk;
          },
        },
      );

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("Evidence: 0");
      expect(stdout).toContain("SOURCE_MISSING");
      expect(stdout).toContain("src_20260615_0001");
      expect(stdout).toContain("raw/sources/2026/06/karpathy-llm-wiki.md");
      expect(stdout).toContain("references/karpathy-llm-wiki, topics/llm-wiki");
      expect(stdout).toContain("Registered source is missing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
