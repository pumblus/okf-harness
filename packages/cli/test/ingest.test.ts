import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli ingest", () => {
  it("returns capped metadata matches without reference documents or scores", async () => {
    const { root, workspace } = await initTestWorkspace();
    await writeFile(
      path.join(workspace, "wiki/references/alpha-priority.md"),
      "---\ntype: Reference\ntitle: Alpha Priority\ntags: [alpha]\n---\n# Alpha Priority\n",
      "utf8",
    );
    await writeFile(
      path.join(workspace, "wiki/topics/alpha-reference.md"),
      "---\ntype: Reference\ntitle: Alpha Priority\ntags: [alpha, priority]\n---\n# Alpha Priority\n",
      "utf8",
    );
    for (const index of Array.from({ length: 6 }, (_, value) => value + 1)) {
      await writeFile(
        path.join(workspace, `wiki/topics/alpha-${index}.md`),
        `---\ntype: Topic\ntitle: Alpha ${index}\ntags: [alpha]\n---\n# Alpha ${index}\n`,
        "utf8",
      );
    }
    const sourcePath = path.join(root, "alpha-priority.md");
    await writeFile(sourcePath, "# Source body is for the Agent, not the plan.\n", "utf8");
    const added = await addSource(workspace, sourcePath);

    const plan = await planIngest(workspace, added.result.data.source.id);

    expect(plan).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "ingest plan",
        workspace,
        data: {
          source: {
            id: added.result.data.source.id,
            path: added.result.data.source.path,
          },
          recommendedReferencePath: "wiki/references/alpha-priority.md",
          nextStep: expect.stringContaining("Read"),
          checklist: expect.arrayContaining([
            expect.stringContaining("Read the full registered source"),
            expect.stringContaining("20 wiki files"),
            expect.stringContaining("Run okfh check --workspace <workspace> --json"),
          ]),
        },
        warnings: [],
        next: [expect.stringContaining("Read")],
      },
    });
    expect(plan.result.data.candidateConcepts).toHaveLength(5);
    expect(plan.result.data.candidateConcepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "topics/alpha-1",
          path: "wiki/topics/alpha-1.md",
          reason: expect.stringContaining("metadata"),
        }),
      ]),
    );
    expect(
      plan.result.data.candidateConcepts.every((concept: { path: string }) =>
        concept.path.startsWith("wiki/topics/"),
      ),
    ).toBe(true);
    expect(
      plan.result.data.candidateConcepts.every(
        (concept: { type: string }) => concept.type !== "Reference",
      ),
    ).toBe(true);
    expect(plan.result.data.candidateConcepts[0]).not.toHaveProperty("score");
    expect(plan.result.data).not.toHaveProperty("suggestedNewConcept");
  });

  it("suggests one metadata-derived Topic when no existing content page matches", async () => {
    const { root, workspace } = await initTestWorkspace();
    const sourcePath = path.join(root, "quantum-notes.md");
    await writeFile(sourcePath, "# Source body is for the Agent, not the plan.\n", "utf8");
    const added = await addSource(workspace, sourcePath);

    const plan = await planIngest(workspace, added.result.data.source.id);

    expect(plan.result.data).toMatchObject({
      candidateConcepts: [],
      suggestedNewConcept: {
        type: "Topic",
        title: "quantum-notes",
        path: "wiki/topics/quantum-notes.md",
        reason: expect.stringContaining("metadata"),
      },
      nextStep: expect.stringContaining("wiki/topics/quantum-notes.md"),
    });
  });

  it("returns an existing suggested path as a candidate instead of a duplicate suggestion", async () => {
    const { root, workspace } = await initTestWorkspace();
    await writeFile(
      path.join(workspace, "wiki/topics/quantum-notes.md"),
      "---\ntype: Topic\ntitle: Quantum Notes\ntags: []\n---\n# Quantum Notes\n",
      "utf8",
    );
    const sourcePath = path.join(root, "quantum-notes.md");
    await writeFile(sourcePath, "# Source body is for the Agent, not the plan.\n", "utf8");
    const added = await addSource(workspace, sourcePath);

    const plan = await planIngest(workspace, added.result.data.source.id);

    expect(plan.result.data.candidateConcepts).toEqual([
      expect.objectContaining({
        id: "topics/quantum-notes",
        path: "wiki/topics/quantum-notes.md",
        reason: expect.stringContaining("metadata-derived topic path already exists"),
      }),
    ]);
    expect(plan.result.data).not.toHaveProperty("suggestedNewConcept");
  });

  it("does not suggest a duplicate new concept when the suggested path already exists", async () => {
    const { root, workspace } = await initTestWorkspace();
    await writeFile(
      path.join(workspace, "wiki/topics/quantum-notes.md"),
      "# Quantum Notes\n",
      "utf8",
    );
    const sourcePath = path.join(root, "quantum-notes.md");
    await writeFile(sourcePath, "# Source body is for the Agent, not the plan.\n", "utf8");
    const added = await addSource(workspace, sourcePath);

    const plan = await planIngest(workspace, added.result.data.source.id);

    expect(plan.result.data.candidateConcepts).toEqual([]);
    expect(plan.result.data).not.toHaveProperty("suggestedNewConcept");
  });
});

async function initTestWorkspace(): Promise<{ root: string; workspace: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
  const workspace = path.join(root, "ai-research");
  await runCli(
    ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
    {
      writeOut: () => {},
      writeErr: () => {},
    },
  );
  return { root, workspace };
}

async function addSource(workspace: string, sourcePath: string): ReturnType<typeof runJsonCli> {
  return runJsonCli([
    "node",
    "okfh",
    "source",
    "add",
    sourcePath,
    "--workspace",
    workspace,
    "--json",
  ]);
}

async function planIngest(workspace: string, sourceId: string): ReturnType<typeof runJsonCli> {
  return runJsonCli([
    "node",
    "okfh",
    "ingest",
    "plan",
    sourceId,
    "--workspace",
    workspace,
    "--json",
  ]);
}
