import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli answer workflow", () => {
  it("runs status, evidence, search, read, graph, and check from an auto-resolved workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await cp(path.resolve("packages/core/test/fixtures/valid-workspace"), workspace, {
      recursive: true,
    });
    await mkdir(path.join(workspace, ".git"));
    const expectedWorkspaceRealPath = await realpath(workspace);
    const previousCwd = process.cwd();
    process.chdir(path.join(workspace, "wiki/topics"));
    try {
      const status = await runJsonCli(["node", "okfh", "status", "--json"]);
      expect(status).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "status",
          data: {
            capabilities: {
              evidence: "available",
              search: "available",
              read: "available",
              graph: "available",
            },
          },
          next: ["Use okfh evidence to answer from bounded synthesized wiki evidence."],
        },
      });
      const resolvedWorkspace = String(status.result.workspace);
      await expect(realpath(resolvedWorkspace)).resolves.toBe(expectedWorkspaceRealPath);

      const search = await runJsonCli(["node", "okfh", "search", "LLM Wiki", "--json"]);
      expect(search).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "search",
          workspace: resolvedWorkspace,
          data: {
            query: "LLM Wiki",
            totalMatches: 2,
            results: expect.arrayContaining([
              expect.objectContaining({
                conceptId: "topics/llm-wiki",
                path: "wiki/topics/llm-wiki.md",
              }),
            ]),
          },
          warnings: [],
        },
      });

      const evidence = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "zqxjv noremote",
        "--workspace",
        resolvedWorkspace,
        "--json",
      ]);
      expect(evidence).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "evidence",
          workspace: resolvedWorkspace,
          data: {
            question: "zqxjv noremote",
            evidence: [],
            candidates: [],
            limits: [
              {
                code: "NO_MATCHES",
              },
            ],
            guidance: expect.any(Array),
          },
          warnings: [],
        },
      });
      expect(JSON.stringify(evidence.result)).not.toMatch(
        /\b(score|confidence|relevance|ranking)\b/i,
      );

      const matchingEvidence = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "LLM Wiki",
        "--workspace",
        resolvedWorkspace,
        "--json",
      ]);
      expect(matchingEvidence).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "evidence",
          workspace: resolvedWorkspace,
          data: {
            question: "LLM Wiki",
            evidence: expect.arrayContaining([
              expect.objectContaining({
                item: 1,
                conceptId: "topics/llm-wiki",
                path: "wiki/topics/llm-wiki.md",
                section: expect.objectContaining({
                  sectionId: "overview",
                  heading: "Overview",
                }),
                range: expect.objectContaining({
                  mode: "section",
                  truncated: false,
                }),
                excerpt: expect.stringContaining("An LLM Wiki keeps raw sources separate"),
                matchReasons: expect.arrayContaining(["section body match: Overview"]),
              }),
            ]),
          },
          warnings: [],
        },
      });
      expect(JSON.stringify(matchingEvidence.result)).not.toMatch(
        /\b(score|confidence|relevance|ranking)\b/i,
      );

      const boundedEvidence = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "LLM Wiki",
        "--workspace",
        resolvedWorkspace,
        "--budget",
        "large",
        "--max-chars",
        "12",
        "--json",
      ]);
      const boundedItems = boundedEvidence.result.data.evidence as Array<{
        conceptId: string;
        range: { endOffset: number; returnedChars: number; truncated: boolean };
        continuationCues: Array<{ target: string; offset: number; limit: number; command: string }>;
      }>;
      const boundedReturnedChars = boundedItems.reduce(
        (total, item) => total + item.range.returnedChars,
        0,
      );
      const boundedTopic = boundedItems.find((item) => item.conceptId === "topics/llm-wiki");
      expect(boundedEvidence).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "evidence",
          workspace: resolvedWorkspace,
          data: {
            budget: {
              preset: "large",
              maxChars: 12,
              override: true,
              usedChars: boundedReturnedChars,
            },
            limits: expect.arrayContaining([
              expect.objectContaining({
                code: "EVIDENCE_TRUNCATED",
              }),
            ]),
          },
          warnings: [],
        },
      });
      expect(boundedReturnedChars).toBeLessThanOrEqual(12);
      expect(boundedTopic).toMatchObject({
        range: {
          truncated: true,
        },
        continuationCues: [
          {
            target: "topics/llm-wiki",
            offset: boundedTopic?.range.endOffset,
            limit: expect.any(Number),
            command: expect.stringContaining("okfh read --workspace"),
          },
        ],
      });

      const read = await runJsonCli(["node", "okfh", "read", "topics/llm-wiki", "--json"]);
      expect(read).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "read",
          workspace: resolvedWorkspace,
          data: {
            target: {
              conceptId: "topics/llm-wiki",
              path: "wiki/topics/llm-wiki.md",
            },
            content: {
              mode: "preview",
              truncated: false,
            },
          },
        },
      });

      const graph = await runJsonCli(["node", "okfh", "graph", "--json"]);
      expect(graph).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "graph",
          workspace: resolvedWorkspace,
          data: {
            report: {
              htmlPath: path.join(resolvedWorkspace, ".okfh/reports/graph.html"),
              backlinksPath: path.join(resolvedWorkspace, ".okfh/backlinks.json"),
            },
            stats: {
              nodes: 2,
            },
          },
        },
      });
      await expect(
        readFile(path.join(resolvedWorkspace, ".okfh/backlinks.json"), "utf8"),
      ).resolves.toContain("topics/llm-wiki");

      const check = await runJsonCli(["node", "okfh", "check", "--json"]);
      expect(check).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "check",
          workspace: resolvedWorkspace,
          data: { status: "ready" },
        },
      });
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("returns SCAN_FAILED envelopes for query commands when wiki scanning fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await cp(path.resolve("packages/core/test/fixtures/valid-workspace"), workspace, {
      recursive: true,
    });
    await rm(path.join(workspace, "wiki"), { recursive: true, force: true });

    for (const { command, argv } of [
      {
        command: "search",
        argv: ["node", "okfh", "search", "LLM Wiki", "--workspace", workspace, "--json"],
      },
      {
        command: "read",
        argv: ["node", "okfh", "read", "topics/llm-wiki", "--workspace", workspace, "--json"],
      },
      {
        command: "evidence",
        argv: ["node", "okfh", "evidence", "LLM Wiki", "--workspace", workspace, "--json"],
      },
      {
        command: "graph",
        argv: ["node", "okfh", "graph", "--workspace", workspace, "--json"],
      },
    ]) {
      const result = await runJsonCli(argv);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toMatchObject({
        ok: false,
        command,
        workspace,
        data: {},
        warnings: [],
        error: {
          code: "SCAN_FAILED",
        },
      });
    }
  });

  it("returns a clear JSON error when evidence is blocked by OKF conformance", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await cp(path.resolve("packages/core/test/fixtures/valid-workspace"), workspace, {
      recursive: true,
    });
    await writeFile(
      path.join(workspace, "wiki/topics/llm-wiki.md"),
      `---
title: LLM Wiki
description: Local markdown bundle maintained by an agent.
---

# Overview

An LLM Wiki keeps raw sources separate from synthesized concept pages.
`,
      "utf8",
    );

    try {
      const result = await runJsonCli([
        "node",
        "okfh",
        "evidence",
        "LLM Wiki",
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toMatchObject({
        ok: false,
        command: "evidence",
        workspace,
        error: {
          code: "EVIDENCE_WORKSPACE_BLOCKED",
          message: "OKF conformance is blocked; evidence cannot be prepared from this wiki.",
          details: {
            okfConformanceFindings: [
              expect.objectContaining({
                code: "OKF_MISSING_TYPE",
                path: "wiki/topics/llm-wiki.md",
              }),
            ],
          },
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads concept ids that start with a dash after --", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await cp(path.resolve("packages/core/test/fixtures/valid-workspace"), workspace, {
      recursive: true,
    });
    await writeFile(
      path.join(workspace, "wiki/-dash.md"),
      `---
type: Topic
title: Dash Topic
description: Dash target fixture.
tags: [dash]
timestamp: "2026-06-15T12:00:00-07:00"
---

# Overview

Dash target content.
`,
      "utf8",
    );

    try {
      const result = await runJsonCli([
        "node",
        "okfh",
        "read",
        "--workspace",
        workspace,
        "--offset",
        "0",
        "--limit",
        "12",
        "--json",
        "--",
        "-dash",
      ]);

      expect(result).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "read",
          workspace,
          data: {
            target: {
              conceptId: "-dash",
              path: "wiki/-dash.md",
            },
          },
        },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("renders query command failures as human text without --json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await cp(path.resolve("packages/core/test/fixtures/valid-workspace"), workspace, {
      recursive: true,
    });
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "read", "missing", "--workspace", workspace], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("No OKF concept document matched the read target.");
    expect(stderr).toContain("Next:");
    expect(stderr.trim()).not.toMatch(/^\{/);
  });
});
