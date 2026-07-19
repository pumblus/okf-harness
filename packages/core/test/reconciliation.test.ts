import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkWorkspace } from "../src/check/index.js";
import { lintWorkspace } from "../src/lint/index.js";
import { addSource, type SourceAddResult } from "../src/source/index.js";
import {
  clearReconciliation,
  readReconciliationLedger,
  reconciliationLedgerPath,
} from "../src/source/reconciliation.js";
import { copyValidWorkspace } from "./helpers.js";

async function addRevision(
  workspaceRoot: string,
  name: string,
  contents: string,
): Promise<SourceAddResult> {
  const inputPath = path.join(workspaceRoot, name);
  await writeFile(inputPath, contents, "utf8");
  return addSource({ workspaceRoot, input: inputPath });
}

async function suspectedEdges(workspaceRoot: string): Promise<string[]> {
  const lint = await lintWorkspace(workspaceRoot);
  return lint.issues
    .filter((issue) => issue.code === "SOURCE_LINEAGE_SUSPECTED")
    .map((issue) => issue.message);
}

describe("clearReconciliation", () => {
  it("stops reporting an acknowledged edge while other edges still report", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const priorPaper = await addRevision(workspaceRoot, "paper.md", "# Paper v1\n");
    const revisedPaper = await addRevision(workspaceRoot, "paper.md", "# Paper v2\n");
    const priorNotes = await addRevision(workspaceRoot, "notes.md", "# Notes v1\n");
    const revisedNotes = await addRevision(workspaceRoot, "notes.md", "# Notes v2\n");

    await clearReconciliation({
      workspaceRoot,
      priorSourceId: priorPaper.source.id,
      revisionSourceId: revisedPaper.source.id,
      note: "Merged the revised methodology section into topics/llm-wiki.md.",
    });

    const messages = await suspectedEdges(workspaceRoot);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(priorNotes.source.id);
    expect(messages[0]).toContain(revisedNotes.source.id);
  });

  it("does not cover a later revision edge, so the signal reappears", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const first = await addRevision(workspaceRoot, "paper.md", "# Paper v1\n");
    const second = await addRevision(workspaceRoot, "paper.md", "# Paper v2\n");

    await clearReconciliation({
      workspaceRoot,
      priorSourceId: first.source.id,
      revisionSourceId: second.source.id,
      note: "Reconciled v2.",
    });
    expect(await suspectedEdges(workspaceRoot)).toEqual([]);

    const third = await addRevision(workspaceRoot, "paper.md", "# Paper v3\n");
    const messages = await suspectedEdges(workspaceRoot);

    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.includes(third.source.id))).toBe(true);
  });

  it("records the judgment note in an append-only ledger outside raw sources", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const first = await addRevision(workspaceRoot, "paper.md", "# Paper v1\n");
    const second = await addRevision(workspaceRoot, "paper.md", "# Paper v2\n");
    const third = await addRevision(workspaceRoot, "paper.md", "# Paper v3\n");

    const earlier = await clearReconciliation({
      workspaceRoot,
      priorSourceId: first.source.id,
      revisionSourceId: third.source.id,
      note: "First edge reconciled.",
    });
    const ledgerAfterFirst = await readFile(path.join(workspaceRoot, earlier.ledgerPath), "utf8");
    const later = await clearReconciliation({
      workspaceRoot,
      priorSourceId: second.source.id,
      revisionSourceId: third.source.id,
      note: "Second edge reconciled.",
    });

    const ledgerAfterSecond = await readFile(path.join(workspaceRoot, later.ledgerPath), "utf8");
    expect(later.ledgerPath).toBe(earlier.ledgerPath);
    expect(later.ledgerPath.startsWith("raw/")).toBe(false);
    expect(ledgerAfterSecond.startsWith(ledgerAfterFirst)).toBe(true);
    expect(ledgerAfterSecond.trimEnd().split("\n")).toHaveLength(2);

    const ledger = await readReconciliationLedger(workspaceRoot);
    expect(ledger.issues).toEqual([]);
    expect(ledger.entries.map((entry) => entry.note)).toEqual([
      "First edge reconciled.",
      "Second edge reconciled.",
    ]);
  });

  it("rejects unregistered source ids and empty judgment notes", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const first = await addRevision(workspaceRoot, "paper.md", "# Paper v1\n");
    const second = await addRevision(workspaceRoot, "paper.md", "# Paper v2\n");

    await expect(
      clearReconciliation({
        workspaceRoot,
        priorSourceId: "src_20260101_0001",
        revisionSourceId: second.source.id,
        note: "Reconciled.",
      }),
    ).rejects.toMatchObject({ code: "SOURCE_NOT_REGISTERED" });
    await expect(
      clearReconciliation({
        workspaceRoot,
        priorSourceId: first.source.id,
        revisionSourceId: second.source.id,
        note: "   ",
      }),
    ).rejects.toMatchObject({ code: "RECONCILIATION_NOTE_REQUIRED" });
    expect(await suspectedEdges(workspaceRoot)).toHaveLength(1);
  });

  it("refuses to place the ledger under an immutable raw root", async () => {
    expect(() =>
      reconciliationLedgerPath({
        paths: {
          raw_inbox: "raw/inbox",
          raw_sources: "raw/sources",
          wiki_root: "wiki",
          manifest: "raw/sources/manifest.jsonl",
        },
      } as Parameters<typeof reconciliationLedgerPath>[0]),
    ).toThrowError(expect.objectContaining({ code: "RECONCILIATION_LEDGER_PATH_UNSAFE" }));
  });

  it("reports invalid ledger rows as a lint error", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const first = await addRevision(workspaceRoot, "paper.md", "# Paper v1\n");
    const second = await addRevision(workspaceRoot, "paper.md", "# Paper v2\n");
    const acknowledgement = await clearReconciliation({
      workspaceRoot,
      priorSourceId: first.source.id,
      revisionSourceId: second.source.id,
      note: "Reconciled.",
    });
    await writeFile(path.join(workspaceRoot, acknowledgement.ledgerPath), "{not json}\n", "utf8");

    const lint = await lintWorkspace(workspaceRoot);
    const check = await checkWorkspace(workspaceRoot);

    expect(lint.ok).toBe(false);
    expect(lint.issues).toContainEqual(
      expect.objectContaining({
        code: "RECONCILIATION_LEDGER_INVALID",
        severity: "error",
        path: acknowledgement.ledgerPath,
        line: 1,
      }),
    );
    expect(check.harnessLint.findings.high).toContainEqual(
      expect.objectContaining({ code: "RECONCILIATION_LEDGER_INVALID" }),
    );
  });
});
