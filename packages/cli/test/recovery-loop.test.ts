import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addSource,
  compoundingKnowledgeTopic,
  llmWikiV2,
  NO_SUBSTRATE_WORDS,
  runJsonCli,
  seedPublicEvolutionWorkspace,
} from "./helpers.js";

const initialOverview =
  "Compounding Knowledge is built once in a persistent wiki and maintained as sources evolve.";
const reconciledOverview = `${initialOverview}
The wiki is kept current instead of being re-derived on every query.`;
const badOverview = "Compounding Knowledge is re-derived from scratch on every query.";

describe("@okf-harness/cli recovery loop", () => {
  it("completes a cycle, lists it, and steps a bad change back in the public evolution scenario", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-recovery-loop-"));
    // Every recovery envelope this loop produces, checked for leaked substrate
    // vocabulary once at the end.
    const recoveryOutput: string[] = [];

    async function runRecorded(...args: string[]) {
      const result = await runJsonCli(["node", "okfh", ...args, "--json"]);
      recoveryOutput.push(result.stdout, result.stderr);
      return result;
    }

    try {
      const { workspace, llmWikiInput, llmWiki } = await seedPublicEvolutionWorkspace(root);
      const topic = path.join(workspace, "wiki/topics/compounding-knowledge.md");
      const hallucinated = path.join(workspace, "wiki/topics/hallucinated.md");

      // Cycle one completes: the wiki reflects both public sources.
      const opening = await runJsonCli([
        "node",
        "okfh",
        "check",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(opening.result.data.currency).toMatchObject({ sealed: true, dangling: [] });

      const first = await runRecorded(
        "checkpoint",
        "--judgment",
        "Built the initial wiki from the two public sources.",
        "--workspace",
        workspace,
      );
      expect(first.exitCode).toBe(0);
      expect(first.stderr).toBe("");

      // Cycle two completes: the LLM Wiki revision is folded into the wiki.
      await writeFile(llmWikiInput, llmWikiV2, "utf8");
      const revision = await addSource(workspace, llmWikiInput);
      await writeFile(topic, compoundingKnowledgeTopic(reconciledOverview), "utf8");
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
      const sealed = await runJsonCli([
        "node",
        "okfh",
        "check",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(sealed.result.data.currency).toMatchObject({ sealed: true, dangling: [] });

      const second = await runRecorded(
        "checkpoint",
        "--judgment",
        "Folded the LLM Wiki revision into the maintained wiki.",
        "--workspace",
        workspace,
      );
      expect(second.exitCode).toBe(0);

      const history = await runRecorded("history", "--workspace", workspace);
      expect(history.result.data.completions).toEqual([
        second.result.data.completion,
        first.result.data.completion,
      ]);

      // A bad change lands and completes: the topic now contradicts its source
      // and an unsupported topic appears beside it.
      await writeFile(topic, compoundingKnowledgeTopic(badOverview), "utf8");
      await writeFile(
        hallucinated,
        "---\ntype: Topic\ntitle: Hallucinated\n---\n\n# Overview\n\nUnsupported claim.\n",
        "utf8",
      );
      const third = await runRecorded(
        "checkpoint",
        "--judgment",
        "Rewrote the compounding knowledge topic.",
        "--workspace",
        workspace,
      );
      expect(third.exitCode).toBe(0);

      // The user asks to undo it; the agent picks the prior completion.
      const restore = await runRecorded(
        "restore",
        second.result.data.completion.id,
        "--workspace",
        workspace,
      );
      expect(restore.exitCode).toBe(0);
      expect(restore.stderr).toBe("");
      expect(restore.result).toMatchObject({
        ok: true,
        command: "restore",
        workspace,
        data: { completion: second.result.data.completion },
        warnings: [],
        next: [],
      });

      // Structure and prose stand exactly as they did at that completion.
      await expect(readFile(topic, "utf8")).resolves.toBe(
        compoundingKnowledgeTopic(reconciledOverview),
      );
      await expect(stat(hallucinated)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(path.join(workspace, revision.path), "utf8")).resolves.toBe(llmWikiV2);

      // The workspace lands on a consistent completed state, and the trail it
      // moved through stays reachable.
      const afterRestore = await runJsonCli([
        "node",
        "okfh",
        "check",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(afterRestore.exitCode).toBe(0);
      expect(afterRestore.result.data.currency).toMatchObject({ sealed: true, dangling: [] });
      const trail = await runRecorded("history", "--workspace", workspace);
      expect(trail.result.data.completions).toEqual([
        third.result.data.completion,
        second.result.data.completion,
        first.result.data.completion,
      ]);

      // The wiki carries no history surface anywhere in the loop.
      await expect(stat(path.join(workspace, "wiki/log.md"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      const readLog = await runJsonCli([
        "node",
        "okfh",
        "read",
        "log",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(readLog.exitCode).toBe(1);
      expect(JSON.parse(readLog.stderr)).toMatchObject({
        error: { code: "TARGET_NOT_FOUND" },
      });

      expect(recoveryOutput.join("")).not.toMatch(NO_SUBSTRATE_WORDS);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
