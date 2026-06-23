import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli terminal-native smoke", () => {
  it("runs init, source add, ingest plan, check, lint retirement, and graph through okfh --json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh cli-"));
    const workspace = path.join(root, "ai-research");
    const sourcePath = path.join(root, "OKF Harness test source.md");
    await writeFile(sourcePath, "# LLM Wiki\n\nTerminal-native source.\n", "utf8");

    const init = await runJsonCli([
      "node",
      "okfh",
      "init",
      workspace,
      "--name",
      "AI Research",
      "--agents",
      "all",
      "--json",
    ]);
    expect(init).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "init",
        workspace,
        data: {
          agents: {
            requested: "all",
          },
        },
      },
    });

    for (const guidance of ["CLAUDE.md", "AGENTS.md"]) {
      await expect(readFile(path.join(workspace, guidance), "utf8")).resolves.toContain(
        "okfh doctor --json",
      );
    }
    const doctor = await runJsonCli(["node", "okfh", "doctor", "--workspace", workspace, "--json"]);
    expect(doctor).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        data: {
          checks: expect.arrayContaining([
            expect.objectContaining({ id: "workspace-adapter-claude", status: "pass" }),
            expect.objectContaining({ id: "workspace-adapter-codex", status: "pass" }),
          ]),
        },
      },
    });

    const added = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);
    expect(added).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "source add",
        data: {
          source: {
            id: expect.stringMatching(/^src_/),
          },
        },
      },
    });

    const plan = await runJsonCli([
      "node",
      "okfh",
      "ingest",
      "plan",
      added.result.data.source.id,
      "--workspace",
      workspace,
      "--json",
    ]);
    expect(plan).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "ingest plan",
        data: {
          source: {
            id: added.result.data.source.id,
          },
          checklist: expect.arrayContaining([expect.stringContaining("okfh check")]),
        },
      },
    });

    const check = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);
    expect(check).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "check",
        workspace,
      },
    });

    const lint = await runJsonCli(["node", "okfh", "lint", "--workspace", workspace, "--json"]);
    expect(lint).toMatchObject({
      exitCode: 1,
      stderr: "",
      result: {
        ok: false,
        command: "lint",
        data: {
          retired: true,
          replacement: "check",
        },
      },
    });

    const graph = await runJsonCli(["node", "okfh", "graph", "--workspace", workspace, "--json"]);
    expect(graph).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "graph",
        workspace,
        data: {
          report: {
            htmlPath: path.join(workspace, ".okfh/reports/graph.html"),
          },
        },
      },
    });
  });
});
