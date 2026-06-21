import { cp, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli query workflow", () => {
  it("runs status, search, read, graph, and check from an auto-resolved workspace", async () => {
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
              search: "available",
              read: "available",
              graph: "available",
            },
          },
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
