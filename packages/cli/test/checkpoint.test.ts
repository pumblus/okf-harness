import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runJsonCli } from "./helpers.js";

const execFileAsync = promisify(execFile);

const llmWikiV1 = `# LLM Wiki

Source: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

The LLM incrementally builds and maintains a persistent wiki between the user and raw sources.
`;
const llmWikiV2 = `${llmWikiV1}
The wiki is a persistent, compounding artifact that is kept current instead of re-derived on every query.
`;
const okfSpec = `# Open Knowledge Format

Source: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

OKF is an open, human- and agent-friendly format for representing knowledge.
It is intentionally minimal: a directory of markdown files with YAML frontmatter.
`;

const NO_SUBSTRATE_WORDS = /git|commit|hash|branch/i;

describe("@okf-harness/cli checkpoint", () => {
  it("creates completions at cycle completion that history lists with only their judgments", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-checkpoint-"));
    const workspace = path.join(root, "workspace");
    const inputs = path.join(root, "public-sources");
    const llmWikiInput = path.join(inputs, "llm-wiki.md");
    const okfInput = path.join(inputs, "okf-spec.md");

    try {
      await runJsonCli([
        "node",
        "okfh",
        "init",
        workspace,
        "--name",
        "Public Knowledge",
        "--agents",
        "none",
        "--json",
      ]);
      await mkdir(inputs, { recursive: true });
      await writeFile(llmWikiInput, llmWikiV1, "utf8");
      await writeFile(okfInput, okfSpec, "utf8");

      const llmWiki = await runJsonCli([
        "node",
        "okfh",
        "source",
        "add",
        llmWikiInput,
        "--workspace",
        workspace,
        "--json",
      ]);
      const okf = await runJsonCli([
        "node",
        "okfh",
        "source",
        "add",
        okfInput,
        "--workspace",
        workspace,
        "--json",
      ]);
      expect([llmWiki.exitCode, okf.exitCode]).toEqual([0, 0]);

      await writeFile(
        path.join(workspace, "wiki/references/llm-wiki-source.md"),
        `---
type: Reference
title: LLM Wiki Source
description: Public source for the agent-maintained wiki pattern.
resource: ${llmWiki.result.data.source.path}
okfh:
  source_id: ${llmWiki.result.data.source.id}
---

# Summary

The source describes an LLM-maintained wiki between users and raw source material.
`,
        "utf8",
      );
      await writeFile(
        path.join(workspace, "wiki/topics/compounding-knowledge.md"),
        `---
type: Topic
title: Compounding Knowledge
description: Persistent synthesis maintained by an agent.
---

# Overview

Compounding Knowledge is built once in a persistent wiki and maintained as sources evolve.

# Citations

- [LLM Wiki Source](/references/llm-wiki-source.md)
`,
        "utf8",
      );
      await writeFile(
        path.join(workspace, "wiki/references/okf-source.md"),
        `---
type: Reference
title: OKF Specification Source
description: Public source for the Open Knowledge Format.
resource: ${okf.result.data.source.path}
okfh:
  source_id: ${okf.result.data.source.id}
---

# Summary

The source specifies a portable markdown knowledge format.
`,
        "utf8",
      );
      await writeFile(
        path.join(workspace, "wiki/topics/portable-knowledge.md"),
        `---
type: Topic
title: Portable Knowledge
description: Knowledge represented in portable files.
---

# Overview

Portable Knowledge uses markdown files with YAML frontmatter.

# Citations

- [OKF Specification Source](/references/okf-source.md)
`,
        "utf8",
      );

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
      const revision = await runJsonCli([
        "node",
        "okfh",
        "source",
        "add",
        llmWikiInput,
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(revision.exitCode).toBe(0);
      const reconciled = await runJsonCli([
        "node",
        "okfh",
        "source",
        "reconcile",
        llmWiki.result.data.source.id,
        revision.result.data.source.id,
        "--note",
        "Reconciled the public LLM Wiki revision.",
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(reconciled.exitCode).toBe(0);

      await writeFile(
        path.join(workspace, "wiki/topics/compounding-knowledge.md"),
        `---
type: Topic
title: Compounding Knowledge
description: Persistent synthesis maintained by an agent.
---

# Overview

Compounding Knowledge is built once in a persistent wiki and maintained as sources evolve.
The wiki is kept current instead of being re-derived on every query.

# Citations

- [LLM Wiki Source](/references/llm-wiki-source.md)
`,
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
