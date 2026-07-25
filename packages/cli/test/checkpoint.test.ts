import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  addSource,
  compoundingKnowledgeTopic,
  llmWikiV2,
  NO_SUBSTRATE_WORDS,
  runJsonCli,
  seedPublicEvolutionWorkspace,
} from "./helpers.js";

const execFileAsync = promisify(execFile);

describe("@okf-harness/cli checkpoint", () => {
  it("creates completions at cycle completion that history lists with only their judgments", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-checkpoint-"));

    try {
      const { workspace, llmWikiInput, llmWiki } = await seedPublicEvolutionWorkspace(root);

      const firstJudgment = "Built the initial wiki from the two public sources.";
      const first = await runJsonCli([
        "node",
        "okfh",
        "checkpoint",
        "--judgment",
        firstJudgment,
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(first.exitCode).toBe(0);
      expect(first.stderr).toBe("");
      expect(first.result).toMatchObject({
        ok: true,
        command: "checkpoint",
        workspace,
        data: { completion: { judgment: firstJudgment } },
        warnings: [],
        next: [],
      });
      expect(typeof first.result.data.completion.id).toBe("string");
      expect(first.result.data.completion.id.length).toBeGreaterThan(0);
      expect(Object.keys(first.result.data.completion).sort()).toEqual(["id", "judgment"]);
      expect(JSON.stringify(first.result)).not.toMatch(NO_SUBSTRATE_WORDS);

      const afterFirst = await runJsonCli([
        "node",
        "okfh",
        "history",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(afterFirst.result.data.completions).toEqual([first.result.data.completion]);
      expect(JSON.stringify(afterFirst.result)).not.toMatch(NO_SUBSTRATE_WORDS);

      await writeFile(llmWikiInput, llmWikiV2, "utf8");
      const revision = await addSource(workspace, llmWikiInput);
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

      await writeFile(
        path.join(workspace, "wiki/topics/compounding-knowledge.md"),
        compoundingKnowledgeTopic(
          `Compounding Knowledge is built once in a persistent wiki and maintained as sources evolve.
The wiki is kept current instead of being re-derived on every query.`,
        ),
        "utf8",
      );
      const verified = await runJsonCli([
        "node",
        "okfh",
        "check",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(verified.result.data.currency).toMatchObject({ sealed: true, dangling: [] });

      const secondJudgment = "Folded the LLM Wiki revision into the maintained wiki.";
      const second = await runJsonCli([
        "node",
        "okfh",
        "checkpoint",
        "--judgment",
        secondJudgment,
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(second.exitCode).toBe(0);
      expect(second.result.data.completion.judgment).toBe(secondJudgment);
      expect(JSON.stringify(second.result)).not.toMatch(NO_SUBSTRATE_WORDS);

      const afterSecond = await runJsonCli([
        "node",
        "okfh",
        "history",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(afterSecond.result.data.completions).toEqual([
        second.result.data.completion,
        first.result.data.completion,
      ]);
      expect(JSON.stringify(afterSecond.result)).not.toMatch(NO_SUBSTRATE_WORDS);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("adopts the recovery substrate on the first checkpoint of a legacy workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-checkpoint-"));

    try {
      // Legacy workspaces predate automatic recovery: one has no substrate at
      // all, the other only the retired opt-in flag's initialized substrate.
      const initialized = path.join(root, "workspace-initialized");
      const legacy = [path.join(root, "workspace-bare"), initialized];
      for (const workspace of legacy) {
        await runJsonCli([
          "node",
          "okfh",
          "init",
          workspace,
          "--name",
          "Legacy",
          "--agents",
          "none",
          "--json",
        ]);
        // Fixture setup only: rewind the workspace to its pre-recovery shape.
        await rm(path.join(workspace, ".git"), { recursive: true, force: true });
      }
      // The retired flag left an initialized substrate without any revisions.
      await execFileAsync("git", ["init", "--quiet"], { cwd: initialized });

      for (const [index, workspace] of legacy.entries()) {
        const judgment = `First completion of legacy workspace ${index + 1}.`;
        const checkpoint = await runJsonCli([
          "node",
          "okfh",
          "checkpoint",
          "--judgment",
          judgment,
          "--workspace",
          workspace,
          "--json",
        ]);
        expect(checkpoint.exitCode).toBe(0);
        expect(checkpoint.stderr).toBe("");
        expect(checkpoint.result.data.completion.judgment).toBe(judgment);
        expect(JSON.stringify(checkpoint.result)).not.toMatch(NO_SUBSTRATE_WORDS);

        const history = await runJsonCli([
          "node",
          "okfh",
          "history",
          "--workspace",
          workspace,
          "--json",
        ]);
        expect(history.result.data.completions).toEqual([checkpoint.result.data.completion]);
        expect(JSON.stringify(history.result)).not.toMatch(NO_SUBSTRATE_WORDS);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a path that is not an OKF Harness workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-checkpoint-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);

    try {
      const checkpoint = await runJsonCli([
        "node",
        "okfh",
        "checkpoint",
        "--judgment",
        "Should not land anywhere.",
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(checkpoint.exitCode).toBe(1);
      expect(checkpoint.stdout).toBe("");
      expect(JSON.parse(checkpoint.stderr)).toMatchObject({
        ok: false,
        command: "checkpoint",
        workspace,
        error: { code: "CONFIG_INVALID" },
      });
      expect(checkpoint.stderr).not.toMatch(NO_SUBSTRATE_WORDS);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a blank judgment", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-checkpoint-"));
    const workspace = path.join(root, "workspace");

    try {
      await runJsonCli([
        "node",
        "okfh",
        "init",
        workspace,
        "--name",
        "Research",
        "--agents",
        "none",
        "--json",
      ]);

      const checkpoint = await runJsonCli([
        "node",
        "okfh",
        "checkpoint",
        "--judgment",
        "   ",
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(checkpoint.exitCode).toBe(1);
      expect(checkpoint.stdout).toBe("");
      expect(JSON.parse(checkpoint.stderr)).toMatchObject({
        ok: false,
        command: "checkpoint",
        error: { code: "JUDGMENT_REQUIRED" },
      });
      expect(checkpoint.stderr).not.toMatch(NO_SUBSTRATE_WORDS);

      const history = await runJsonCli([
        "node",
        "okfh",
        "history",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(history.result.data.completions).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
