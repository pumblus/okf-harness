import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { harnessRuntimeVersion, parseWorkspaceConfig } from "@okf-harness/core";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import { makeTempDir as mkdtemp, removeRuntimePin, runJsonCli } from "./helpers.js";

const NEXT_INITIALIZE_WORKSPACE =
  "Ask your agent to initialize this folder as an OKF Harness workspace before continuing.";
const NEXT_FIX_OKF_CONFORMANCE =
  "Ask your agent to fix OKF conformance before answering from this workspace.";
const NEXT_HANDLE_CHECK_FINDINGS =
  "Ask your agent to handle the check findings before answering from this workspace.";
const NEXT_ADD_LOCAL_SOURCE =
  "Ask your agent to add one local source file, such as a PDF or Markdown note, to this workspace.";
const NEXT_REPLACE_URL_POINTERS =
  "Ask your agent to add a local source file or save the webpage content as a file; URL sources are pointers only.";
const NEXT_UPDATE_WIKI =
  "Ask your agent to update the wiki with citations from the registered local source.";
const NEXT_FIRST_ANSWER_CHECK =
  "Ask your agent to answer these questions from synthesized wiki evidence: what is the source mainly about, what are its key conclusions, and where does the evidence come from?";

describe("@okf-harness/cli workspace", () => {
  it("reports workspace status as JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "status", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      ok: true,
      command: "status",
      workspace,
      data: {
        initialized: true,
        name: "AI Research",
        check: {
          status: "ready",
          okfVersion: "0.1",
        },
      },
      warnings: [],
      next: [NEXT_ADD_LOCAL_SOURCE],
    });
  });

  it("keeps status as a quick overview instead of full check output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    const sourcePath = path.join(root, "paper.md");
    await writeFile(sourcePath, "# Paper\n\nOriginal.\n", "utf8");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let addStdout = "";
    await runCli(
      ["node", "okfh", "source", "add", sourcePath, "--workspace", workspace, "--json"],
      {
        writeOut: (chunk) => {
          addStdout += chunk;
        },
        writeErr: () => {},
      },
    );
    const added = JSON.parse(addStdout);
    await writeFile(path.join(workspace, added.data.source.path), "# Paper\n\nChanged.\n", "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "status", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      ok: true,
      command: "status",
      data: {
        check: {
          status: "needs_attention",
          okfVersion: "0.1",
        },
      },
      next: [NEXT_HANDLE_CHECK_FINDINGS],
    });
    expect(result.data).not.toHaveProperty("okfConformance");
    expect(result.data).not.toHaveProperty("harnessLint");
  });

  it("checks a ready workspace as JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      command: "check",
      workspace,
      data: {
        status: "ready",
        okfVersion: "0.1",
        currency: {
          sealed: true,
          dangling: [],
        },
        okfConformance: {
          ok: true,
          findings: [],
        },
        harnessLint: {
          ok: true,
          findings: {
            high: [],
            medium: [],
            low: [],
          },
        },
      },
      warnings: [],
      next: [NEXT_ADD_LOCAL_SOURCE],
    });
  });

  it("distinguishes a workspace with nothing to reconcile from a sealed one", async () => {
    const { root, workspace } = await initWorkspace();

    const empty = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);
    let emptyStdout = "";
    await runCli(["node", "okfh", "check", "--workspace", workspace], {
      writeOut: (chunk) => {
        emptyStdout += chunk;
      },
      writeErr: () => {},
    });

    expect(empty.result.data.currency).toMatchObject({ sealed: true, promotedSources: 0 });
    expect(emptyStdout).toContain("Currency: no promoted sources to reconcile");
    expect(emptyStdout).not.toContain("Currency: sealed");

    const sourcePath = path.join(root, "paper.md");
    await writeFile(sourcePath, "# Paper v1\n", "utf8");
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
    await mkdir(path.join(workspace, "wiki/references"), { recursive: true });
    await writeFile(
      path.join(workspace, "wiki/references/paper.md"),
      `---\ntype: Reference\ntitle: Paper\nokfh:\n  source_id: ${added.result.data.source.id}\n---\n# Paper\n`,
      "utf8",
    );

    const promoted = await runJsonCli([
      "node",
      "okfh",
      "check",
      "--workspace",
      workspace,
      "--json",
    ]);
    let promotedStdout = "";
    await runCli(["node", "okfh", "check", "--workspace", workspace], {
      writeOut: (chunk) => {
        promotedStdout += chunk;
      },
      writeErr: () => {},
    });

    expect(promoted.result.data.currency).toMatchObject({ sealed: true, promotedSources: 1 });
    expect(promotedStdout).toContain("Currency: sealed");
  });

  it("reports unsealed currency without changing the check exit code", async () => {
    const { root, workspace } = await initWorkspace();
    const sourcePath = path.join(root, "paper.md");
    await writeFile(sourcePath, "# Paper v1\n", "utf8");
    const prior = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);
    await mkdir(path.join(workspace, "wiki/references"), { recursive: true });
    await writeFile(
      path.join(workspace, "wiki/references/paper.md"),
      `---\ntype: Reference\ntitle: Paper\nokfh:\n  source_id: ${prior.result.data.source.id}\n---\n# Paper\n`,
      "utf8",
    );
    await writeFile(sourcePath, "# Paper v2\n", "utf8");
    const revision = await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);

    const checked = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);
    let stdout = "";
    let stderr = "";
    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(checked.exitCode).toBe(0);
    expect(checked.result.data.currency).toEqual({
      sealed: false,
      promotedSources: 1,
      dangling: [
        {
          original: "paper.md",
          priorSourceId: prior.result.data.source.id,
          revisionSourceId: revision.result.data.source.id,
          promotedBy: ["wiki/references/paper.md"],
        },
      ],
      diagnostics: [],
    });
    expect(checked.result.data.harnessLint.findings.medium).toContainEqual(
      expect.objectContaining({ code: "SOURCE_LINEAGE_SUSPECTED" }),
    );
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Currency: not sealed (paper.md)");
  });

  it("reports unverifiable currency with diagnostics without changing the check exit code", async () => {
    const { workspace } = await initWorkspace();
    await mkdir(path.join(workspace, ".okfh"), { recursive: true });
    await writeFile(path.join(workspace, ".okfh", "manifest.jsonl"), "not-json\n", "utf8");

    const checked = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);
    let stdout = "";
    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: () => {},
    });

    expect(checked.exitCode).toBe(0);
    expect(checked.result.data.currency).toEqual({
      sealed: false,
      promotedSources: 0,
      dangling: [],
      diagnostics: [
        expect.objectContaining({ code: "MANIFEST_INVALID", path: ".okfh/manifest.jsonl" }),
      ],
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Currency: not sealed (MANIFEST_INVALID)");
  });

  it("surfaces invalid config diagnostics through check", async () => {
    const { workspace } = await initWorkspace();
    await writeFile(path.join(workspace, "okfh.config.yaml"), "not: valid\n", "utf8");

    const checked = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);

    expect(checked).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "check",
        data: {
          currency: {
            sealed: false,
            dangling: [],
          },
        },
      },
    });
    expect(checked.result.data.currency.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONFIG_INVALID" }),
    );
  });

  it("returns the same next step for URL-only sources", async () => {
    const { workspace } = await initWorkspace();
    await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      "https://example.com/research/article",
      "--workspace",
      workspace,
      "--json",
    ]);

    await expectStatusAndCheckNext(workspace, NEXT_REPLACE_URL_POINTERS);
  });

  it("returns the same next step for local sources without concept documents", async () => {
    const { root, workspace } = await initWorkspace();
    const sourcePath = path.join(root, "paper.md");
    await writeFile(sourcePath, "# Paper\n\nOriginal.\n", "utf8");
    await runJsonCli([
      "node",
      "okfh",
      "source",
      "add",
      sourcePath,
      "--workspace",
      workspace,
      "--json",
    ]);

    await expectStatusAndCheckNext(workspace, NEXT_UPDATE_WIKI);
  });

  it("returns the same next step for ready workspaces with local sources and concepts", async () => {
    await expectStatusAndCheckNext(
      path.resolve("examples/ai-research-workspace"),
      NEXT_FIRST_ANSWER_CHECK,
    );
  });

  it("renders the status next step in human output", async () => {
    const { workspace } = await initWorkspace();
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "status", "--workspace", workspace], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(`OK status\nNext: ${NEXT_ADD_LOCAL_SOURCE}\n`);
  });

  it("keeps failed status human output aligned with the exit code", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "status", "--workspace", workspace], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toBe("");
    expect(stdout).toBe(`FAILED status\nNext: ${NEXT_INITIALIZE_WORKSPACE}\n`);
  });

  it("renders concise human check output", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Status: Ready");
    expect(stdout).toContain("OKF version: 0.1");
    expect(stdout).toContain("OKF conformance: pass");
    expect(stdout).toContain("Harness lint: pass");
    expect(stdout).toContain(`Next: ${NEXT_ADD_LOCAL_SOURCE}`);
  });

  it("keeps needs-attention checks successful for scripts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    const sourcePath = path.join(root, "paper.md");
    await writeFile(sourcePath, "# Paper\n\nOriginal.\n", "utf8");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    let addStdout = "";
    await runCli(
      ["node", "okfh", "source", "add", sourcePath, "--workspace", workspace, "--json"],
      {
        writeOut: (chunk) => {
          addStdout += chunk;
        },
        writeErr: () => {},
      },
    );
    const added = JSON.parse(addStdout);
    await writeFile(path.join(workspace, added.data.source.path), "# Paper\n\nChanged.\n", "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      command: "check",
      data: {
        status: "needs_attention",
        harnessLint: {
          findings: {
            high: [expect.objectContaining({ code: "SOURCE_HASH_DRIFT" })],
          },
        },
      },
      next: [NEXT_HANDLE_CHECK_FINDINGS],
    });
  });

  it("fails blocked checks when OKF conformance fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "ai-research");
    await runCli(
      ["node", "okfh", "init", workspace, "--name", "AI Research", "--agents", "none", "--json"],
      {
        writeOut: () => {},
        writeErr: () => {},
      },
    );
    await writeFile(path.join(workspace, "wiki/topics/drifted.md"), "# Drifted\n", "utf8");
    let stdout = "";
    let stderr = "";

    const status = await runJsonCli(["node", "okfh", "status", "--workspace", workspace, "--json"]);
    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(status).toMatchObject({
      exitCode: 1,
      stderr: "",
      result: {
        ok: false,
        command: "status",
        next: [NEXT_FIX_OKF_CONFORMANCE],
      },
    });
    expect(exitCode).toBe(1);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ok: false,
      command: "check",
      data: {
        status: "blocked",
        okfConformance: {
          ok: false,
          findings: [expect.objectContaining({ code: "OKF_MISSING_FRONTMATTER" })],
        },
      },
      next: [NEXT_FIX_OKF_CONFORMANCE],
    });
  });

  it("reports the retired lint command as an unknown command", async () => {
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "lint", "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      command: "lint",
      data: {},
      error: { code: "commander.unknownCommand" },
    });
  });

  it("fails check when the workspace is not initialized", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      ok: false,
      command: "check",
      workspace,
      data: {},
      error: {
        code: "WORKSPACE_NOT_INITIALIZED",
      },
      next: [NEXT_INITIALIZE_WORKSPACE],
    });
  });

  it("does not treat a file path as an initialized workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "not-a-directory");
    await writeFile(workspace, "not a directory\n", "utf8");
    let stdout = "";
    let stderr = "";

    const exitCode = await runCli(["node", "okfh", "check", "--workspace", workspace, "--json"], {
      writeOut: (chunk) => {
        stdout += chunk;
      },
      writeErr: (chunk) => {
        stderr += chunk;
      },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: "WORKSPACE_NOT_INITIALIZED" },
      workspace,
    });
  });

  it("returns an initialization next step for uninitialized status JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);

    const status = await runJsonCli(["node", "okfh", "status", "--workspace", workspace, "--json"]);

    expect(status).toMatchObject({
      exitCode: 1,
      stderr: "",
      result: {
        ok: false,
        command: "status",
        workspace,
        data: {
          initialized: false,
        },
        next: [NEXT_INITIALIZE_WORKSPACE],
      },
    });
  });

  it("records a runtime pin into a workspace created before pins existed", async () => {
    const { workspace } = await initWorkspace();
    const configPath = path.join(workspace, "okfh.config.yaml");
    await removeRuntimePin(workspace);
    await writeFile(configPath, `${await readFile(configPath, "utf8")}# keep me\n`, "utf8");

    const planned = await runJsonCli([
      "node",
      "okfh",
      "adopt-runtime",
      "--workspace",
      workspace,
      "--dry-run",
      "--json",
    ]);

    expect(planned.exitCode).toBe(0);
    expect(planned.result.data).toMatchObject({
      runtime: { version: harnessRuntimeVersion },
      state: "would-record",
      dryRun: true,
    });
    expect(await readFile(configPath, "utf8")).not.toContain("runtime:");

    const adopted = await runJsonCli([
      "node",
      "okfh",
      "adopt-runtime",
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(adopted).toMatchObject({
      exitCode: 0,
      stderr: "",
      result: {
        ok: true,
        command: "adopt-runtime",
        workspace,
        data: {
          runtime: { version: harnessRuntimeVersion },
          state: "recorded",
          dryRun: false,
        },
      },
    });
    const written = await readFile(configPath, "utf8");
    expect(parseWorkspaceConfig(written)).toMatchObject({
      ok: true,
      config: { version: "0.1", runtime: { version: harnessRuntimeVersion } },
    });
    expect(written).toContain("# keep me");

    const rerun = await runJsonCli([
      "node",
      "okfh",
      "adopt-runtime",
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(rerun.exitCode).toBe(0);
    expect(rerun.result.data).toMatchObject({
      runtime: { version: harnessRuntimeVersion },
      state: "already-pinned",
    });
  });

  it("reports an unreadable workspace config as CONFIG_INVALID", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-cli-"));

    const adopted = await runJsonCli([
      "node",
      "okfh",
      "adopt-runtime",
      "--workspace",
      root,
      "--json",
    ]);

    expect(adopted.exitCode).toBe(1);
    expect(JSON.parse(adopted.stderr)).toMatchObject({
      ok: false,
      command: "adopt-runtime",
      error: { code: "CONFIG_INVALID" },
    });
  });

  it("reports a malformed pin as CONFIG_INVALID instead of recording one", async () => {
    const { workspace } = await initWorkspace();
    const configPath = path.join(workspace, "okfh.config.yaml");
    await writeFile(
      configPath,
      (await readFile(configPath, "utf8")).replace(
        /runtime:\n {2}version: .*\n/,
        "runtime:\n  version: latest\n",
      ),
      "utf8",
    );

    const adopted = await runJsonCli([
      "node",
      "okfh",
      "adopt-runtime",
      "--workspace",
      workspace,
      "--json",
    ]);

    expect(adopted.exitCode).toBe(1);
    expect(adopted.stdout).toBe("");
    expect(JSON.parse(adopted.stderr)).toMatchObject({
      ok: false,
      command: "adopt-runtime",
      workspace,
      error: { code: "CONFIG_INVALID" },
    });
    expect(await readFile(configPath, "utf8")).toContain("version: latest");
  });
});

async function initWorkspace(): Promise<{ root: string; workspace: string }> {
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

async function expectStatusAndCheckNext(workspace: string, expectedNext: string): Promise<void> {
  const status = await runJsonCli(["node", "okfh", "status", "--workspace", workspace, "--json"]);
  const check = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);
  let statusStdout = "";
  let checkStdout = "";

  expect(status).toMatchObject({
    exitCode: 0,
    stderr: "",
    result: {
      ok: true,
      next: [expectedNext],
    },
  });
  expect(check).toMatchObject({
    exitCode: 0,
    stderr: "",
    result: {
      ok: true,
      next: [expectedNext],
    },
  });

  expect(
    await runCli(["node", "okfh", "status", "--workspace", workspace], {
      writeOut: (chunk) => {
        statusStdout += chunk;
      },
      writeErr: () => {},
    }),
  ).toBe(0);
  expect(
    await runCli(["node", "okfh", "check", "--workspace", workspace], {
      writeOut: (chunk) => {
        checkStdout += chunk;
      },
      writeErr: () => {},
    }),
  ).toBe(0);
  expect(statusStdout).toBe(`OK status\nNext: ${expectedNext}\n`);
  expect(checkStdout).toContain(`Next: ${expectedNext}`);
}
