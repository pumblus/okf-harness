import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addSource,
  llmWikiV1,
  llmWikiV2,
  runJsonCli,
  seedPublicEvolutionWorkspace,
} from "./helpers.js";

function conceptIds(evidence: Awaited<ReturnType<typeof runJsonCli>>): string[] {
  return evidence.result.data.evidence.map((item: { conceptId: string }) => item.conceptId);
}

describe("@okf-harness/cli closed maintenance loop", () => {
  it("seals damaged evidence but not pending reconciliation in a disposable public workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-maintenance-loop-"));

    try {
      const { workspace, llmWikiInput, llmWiki } = await seedPublicEvolutionWorkspace(root);

      const available = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "Compounding Knowledge",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(conceptIds(available)).toContain("topics/compounding-knowledge");
      expect(available.result.data.seals).toEqual([]);

      const registeredPath = path.join(workspace, llmWiki.path);
      await rm(registeredPath);
      const damaged = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "Compounding Knowledge",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(damaged).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          data: {
            seals: [
              {
                code: "SOURCE_MISSING",
                sourceId: llmWiki.id,
                sourcePath: llmWiki.path,
                sealed: ["references/llm-wiki-source", "topics/compounding-knowledge"],
              },
            ],
          },
        },
      });
      expect(conceptIds(damaged)).not.toContain("topics/compounding-knowledge");

      const unrelated = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "Portable Knowledge",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(conceptIds(unrelated)).toContain("topics/portable-knowledge");

      await writeFile(registeredPath, llmWikiV1, "utf8");
      const restored = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "Compounding Knowledge",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(conceptIds(restored)).toEqual(conceptIds(available));
      expect(restored.result.data.seals).toEqual([]);

      await writeFile(llmWikiInput, llmWikiV2, "utf8");
      const revision = await addSource(workspace, llmWikiInput);
      const openCurrency = await runJsonCli([
        "node",
        "okfh",
        "check",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(openCurrency.result.data.currency).toMatchObject({
        sealed: false,
        dangling: [
          {
            priorSourceId: llmWiki.id,
            revisionSourceId: revision.id,
          },
        ],
      });

      const pending = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "Compounding Knowledge",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(conceptIds(pending)).toEqual(conceptIds(restored));
      expect(pending.result.data.seals).toEqual([]);

      const reconciled = await runJsonCli([
        "node",
        "okfh",
        "source",
        "reconcile",
        llmWiki.id,
        revision.id,
        "--note",
        "Reconciled the public LLM Wiki revision.",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(reconciled.exitCode).toBe(0);

      const sealedCurrency = await runJsonCli([
        "node",
        "okfh",
        "check",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(sealedCurrency.result.data.currency).toMatchObject({ sealed: true, dangling: [] });

      const afterReconciliation = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "Compounding Knowledge",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(conceptIds(afterReconciliation)).toEqual(conceptIds(restored));
      expect(afterReconciliation.result.data.seals).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
