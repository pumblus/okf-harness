import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkCurrencyFromSnapshot, checkLintResult, checkWorkspace } from "../src/check/index.js";
import { planEvidenceBrief } from "../src/evidence/index.js";
import {
  buildWorkspaceGraphData,
  buildWorkspaceGraphDataFromSnapshot,
} from "../src/graph/index.js";
import { readWorkspaceSnapshot } from "../src/lineage/index.js";
import { lintWorkspace, lintWorkspaceFromSnapshot } from "../src/lint/index.js";
import { readWorkspaceDocument, readWorkspaceDocumentFromSnapshot } from "../src/read/index.js";
import { searchWorkspace, searchWorkspaceFromSnapshot } from "../src/search/index.js";
import { readWorkspaceStatus } from "../src/workspace/index.js";
import { copyValidWorkspace, validWorkspaceFixture } from "./helpers.js";

const fixedNow = new Date("2026-01-01T00:00:00.000Z");

/**
 * Parity: the root-based entry points and the snapshot-based cores must produce
 * identical results for the same workspace, proving the wrapper seam is
 * behavior-neutral and the snapshot carries everything the read side needs.
 */
describe("workspace snapshot parity", () => {
  it("read: root entry and snapshot core agree", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const snapshot = await readWorkspaceSnapshot(workspaceRoot);

    const fromRoot = await readWorkspaceDocument({
      workspaceRoot,
      target: "topics/llm-wiki",
    });
    const fromSnapshot = await readWorkspaceDocumentFromSnapshot(snapshot, {
      target: "topics/llm-wiki",
    });
    expect(fromSnapshot).toEqual(fromRoot);

    const sectionFromRoot = await readWorkspaceDocument({
      workspaceRoot,
      target: "topics/llm-wiki",
      section: "Overview",
    });
    const sectionFromSnapshot = await readWorkspaceDocumentFromSnapshot(snapshot, {
      target: "topics/llm-wiki",
      section: "Overview",
    });
    expect(sectionFromSnapshot).toEqual(sectionFromRoot);
  });

  it("search: root entry and snapshot core agree", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const snapshot = await readWorkspaceSnapshot(workspaceRoot);

    const fromRoot = await searchWorkspace({ workspaceRoot, query: "LLM Wiki" });
    const fromSnapshot = searchWorkspaceFromSnapshot(snapshot, { query: "LLM Wiki" }, new Set());
    expect(fromSnapshot).toEqual(fromRoot);
  });

  it("graph: root entry and snapshot core agree", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const snapshot = await readWorkspaceSnapshot(workspaceRoot);

    const fromRoot = await buildWorkspaceGraphData({ workspaceRoot, now: fixedNow });
    const fromSnapshot = await buildWorkspaceGraphDataFromSnapshot(snapshot, { now: fixedNow });
    expect(fromSnapshot).toEqual(fromRoot);
  });

  it("check: root entry and pipeline agree", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const snapshot = await readWorkspaceSnapshot(workspaceRoot);

    const fromRoot = await checkWorkspace(workspaceRoot);
    const lint = await lintWorkspaceFromSnapshot(snapshot);
    const fromPipeline = checkLintResult(lint, checkCurrencyFromSnapshot(snapshot, lint));
    expect(fromPipeline).toEqual(fromRoot);
  });

  it("lint: root entry and snapshot core agree", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const snapshot = await readWorkspaceSnapshot(workspaceRoot);

    const fromRoot = await lintWorkspace(workspaceRoot);
    const fromSnapshot = await lintWorkspaceFromSnapshot(snapshot);
    expect(fromSnapshot).toEqual(fromRoot);
  });

  it("status: counts and check come from the one snapshot", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const snapshot = await readWorkspaceSnapshot(workspaceRoot);

    const status = await readWorkspaceStatus(workspaceRoot);
    expect(status.initialized).toBe(true);
    expect(status.name).toBe(snapshot.config?.workspace.name);
    expect(status.wikiFiles).toBe(snapshot.files.length);
    expect(status.concepts).toBe(snapshot.conceptCount);

    const lint = await lintWorkspaceFromSnapshot(snapshot);
    expect(status.lint).toEqual(lint);
    expect(status.check).toEqual(checkLintResult(lint, checkCurrencyFromSnapshot(snapshot, lint)));
  });

  it("evidence: brief succeeds and matches the fixture's content", async () => {
    const workspaceRoot = await copyValidWorkspace();
    const result = await planEvidenceBrief({ workspaceRoot, question: "LLM Wiki" });

    expect(result.workspaceRoot).toBe(path.resolve(workspaceRoot));
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.seals).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("workspace snapshot degraded state", () => {
  it("keeps reference facts derivable from the snapshot alone", async () => {
    const snapshot = await readWorkspaceSnapshot(validWorkspaceFixture);

    expect(snapshot.workspaceRoot).toBe(path.resolve(validWorkspaceFixture));
    expect(snapshot.config).toBeDefined();
    expect(snapshot.concepts.length).toBeGreaterThan(0);
    expect(snapshot.referencePathsBySource.size).toBeGreaterThan(0);
    for (const paths of snapshot.referencePathsBySource.values()) {
      expect(paths.length).toBeGreaterThan(0);
    }
  });
});
