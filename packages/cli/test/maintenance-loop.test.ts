import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runJsonCli } from "./helpers.js";

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

function conceptIds(evidence: Awaited<ReturnType<typeof runJsonCli>>): string[] {
  return evidence.result.data.evidence.map((item: { conceptId: string }) => item.conceptId);
}

describe("@okf-harness/cli closed maintenance loop", () => {
  it("seals damaged evidence but not pending reconciliation in a disposable public workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-maintenance-loop-"));
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

      const registeredPath = path.join(workspace, llmWiki.result.data.source.path);
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
                sourceId: llmWiki.result.data.source.id,
                sourcePath: llmWiki.result.data.source.path,
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
            priorSourceId: llmWiki.result.data.source.id,
            revisionSourceId: revision.result.data.source.id,
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
        llmWiki.result.data.source.id,
        revision.result.data.source.id,
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
