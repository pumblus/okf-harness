import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkWorkspace } from "../src/check/index.js";
import { planEvidenceBrief } from "../src/evidence/index.js";
import { buildWorkspaceGraphData } from "../src/graph/index.js";
import { lintWorkspace } from "../src/lint/index.js";
import { readWorkspaceDocument } from "../src/read/index.js";
import { searchWorkspace } from "../src/search/index.js";
import { readWorkspaceStatus } from "../src/workspace/index.js";
import { copyValidWorkspace } from "./helpers.js";

vi.mock("../src/okf/concepts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/okf/concepts.js")>();
  return { ...actual, scanConcepts: vi.fn(actual.scanConcepts) };
});

import { scanConcepts } from "../src/okf/concepts.js";

const mockedScanConcepts = vi.mocked(scanConcepts);

/**
 * One snapshot per invocation: every read-side entry point must scan the wiki
 * tree exactly once. A regression that rescans inside a loop (or reads through
 * a root-based entry from a snapshot-based caller) turns this red.
 */
describe("one workspace snapshot per entry point", () => {
  beforeEach(() => {
    mockedScanConcepts.mockClear();
  });

  afterEach(() => {
    expect(mockedScanConcepts).toHaveBeenCalledTimes(1);
  });

  it("readWorkspaceDocument scans once", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await readWorkspaceDocument({ workspaceRoot, target: "topics/llm-wiki" });
  });

  it("searchWorkspace scans once", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await searchWorkspace({ workspaceRoot, query: "LLM Wiki" });
  });

  it("buildWorkspaceGraphData scans once", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await buildWorkspaceGraphData({ workspaceRoot });
  });

  it("planEvidenceBrief scans once across pipeline, graph, search, and reads", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await planEvidenceBrief({ workspaceRoot, question: "LLM Wiki" });
  });

  it("checkWorkspace scans once", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await checkWorkspace(workspaceRoot);
  });

  it("readWorkspaceStatus scans once", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await readWorkspaceStatus(workspaceRoot);
  });

  it("lintWorkspace scans once", async () => {
    const workspaceRoot = await copyValidWorkspace();
    await lintWorkspace(workspaceRoot);
  });
});
