import path from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { type CommandDeclaration, defineCommand } from "../src/define-command.js";
import { handleCliError } from "../src/errors/index.js";
import { parseIntegerOption } from "../src/options/index.js";
import type { CliIo } from "../src/types.js";
import { makeTempDir } from "./helpers.js";

const fakeDeclaration: CommandDeclaration = {
  command: "fake <topic>",
  description: "Fake command exercising the defineCommand envelope lifecycle.",
  options: [
    {
      flags: "--limit <number>",
      description: "maximum results to return",
      parse: parseIntegerOption,
    },
  ],
  run: async (args, options, workspaceRoot) => ({
    data: { topic: args[0], limit: options.limit, resolved: workspaceRoot },
    warnings: [{ code: "FAKE_NOTE", message: "fake warning" }],
    next: ["Run okfh fake <topic> --json again."],
  }),
  human: (envelope) => {
    const data = envelope.data as { topic: string };
    return `Fake result for ${data.topic}\n`;
  },
};

function failingRun(error: unknown): CommandDeclaration["run"] {
  return async () => {
    throw error;
  };
}

async function runDeclared(
  declaration: CommandDeclaration,
  argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string; rejection: unknown }> {
  const program = new Command();
  program.exitOverride();
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  const io: CliIo = {
    writeOut: (chunk) => {
      stdout += chunk;
    },
    writeErr: (chunk) => {
      stderr += chunk;
    },
  };
  defineCommand(
    program,
    io,
    (code) => {
      exitCode = code;
    },
    declaration,
  );
  try {
    await program.parseAsync(["node", "okfh", ...argv]);
    return { exitCode, stdout, stderr, rejection: undefined };
  } catch (rejection) {
    return { exitCode, stdout, stderr, rejection };
  }
}

describe("defineCommand", () => {
  it("writes a success JSON envelope with the resolved workspace and exits 0", async () => {
    const workspace = await makeTempDir("define-command-");
    const { exitCode, stdout, stderr, rejection } = await runDeclared(fakeDeclaration, [
      "fake",
      "magnets",
      "--workspace",
      workspace,
      "--limit",
      "3",
      "--json",
    ]);

    expect(rejection).toBeUndefined();
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      command: "fake",
      workspace: path.resolve(workspace),
      data: { topic: "magnets", limit: 3, resolved: path.resolve(workspace) },
      warnings: [{ code: "FAKE_NOTE", message: "fake warning" }],
      next: ["Run okfh fake <topic> --json again."],
    });
  });

  it("renders human output through the declared renderer", async () => {
    const workspace = await makeTempDir("define-command-");
    const { exitCode, stdout, stderr, rejection } = await runDeclared(fakeDeclaration, [
      "fake",
      "magnets",
      "--workspace",
      workspace,
    ]);

    expect(rejection).toBeUndefined();
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe("Fake result for magnets\n");
  });

  it("writes a handled error envelope to stderr, exits 1, and synthesizes the default next hint", async () => {
    const workspace = await makeTempDir("define-command-");
    const error = Object.assign(new Error("workspace exploded"), { code: "WORKSPACE_EXPLODED" });
    const { exitCode, stdout, stderr, rejection } = await runDeclared(
      { ...fakeDeclaration, run: failingRun(error) },
      ["fake", "magnets", "--workspace", workspace, "--json"],
    );

    expect(rejection).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(JSON.parse(stderr)).toEqual({
      ok: false,
      command: "fake",
      workspace: path.resolve(workspace),
      data: {},
      warnings: [],
      error: { code: "WORKSPACE_EXPLODED", message: "workspace exploded" },
      next: ["Check the workspace path and rerun okfh fake --json."],
    });
  });

  it("uses a static errorNext override", async () => {
    const workspace = await makeTempDir("define-command-");
    const error = Object.assign(new Error("workspace exploded"), { code: "WORKSPACE_EXPLODED" });
    const { stderr } = await runDeclared(
      { ...fakeDeclaration, errorNext: ["Read the manual first."], run: failingRun(error) },
      ["fake", "magnets", "--workspace", workspace, "--json"],
    );

    expect((JSON.parse(stderr) as { next: string[] }).next).toEqual(["Read the manual first."]);
  });

  it("uses a function-form errorNext override with the caught error", async () => {
    const workspace = await makeTempDir("define-command-");
    const openError = Object.assign(new Error("cannot open report"), { code: "GRAPH_OPEN" });
    const { stderr } = await runDeclared(
      {
        ...fakeDeclaration,
        errorNext: (error) =>
          error === openError ? ["Open the report manually."] : ["Write permissions hint."],
        run: failingRun(openError),
      },
      ["fake", "magnets", "--workspace", workspace, "--json"],
    );

    expect((JSON.parse(stderr) as { next: string[] }).next).toEqual(["Open the report manually."]);
  });

  it("writes a handled error in human form to stderr and exits 1 without --json", async () => {
    const workspace = await makeTempDir("define-command-");
    const error = Object.assign(new Error("workspace exploded"), { code: "WORKSPACE_EXPLODED" });
    const { exitCode, stdout, stderr, rejection } = await runDeclared(
      { ...fakeDeclaration, run: failingRun(error) },
      ["fake", "magnets", "--workspace", workspace],
    );

    expect(rejection).toBeUndefined();
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      "workspace exploded\nNext: Check the workspace path and rerun okfh fake --json.\n",
    );
  });

  it("rethrows errors the error writer cannot normalize without writing output or setting an exit code", async () => {
    const workspace = await makeTempDir("define-command-");
    const error = new Error("unexpected boom");
    const { exitCode, stdout, stderr, rejection } = await runDeclared(
      { ...fakeDeclaration, run: failingRun(error) },
      ["fake", "magnets", "--workspace", workspace],
    );

    expect(rejection).toBe(error);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("");

    let topLevelStderr = "";
    const topLevelIo: CliIo = {
      writeOut: () => {},
      writeErr: (chunk) => {
        topLevelStderr += chunk;
      },
    };
    expect(
      handleCliError(rejection, topLevelIo, { command: "fake", json: true, capturedStderr: "" }),
    ).toBe(5);
    expect(JSON.parse(topLevelStderr)).toMatchObject({
      ok: false,
      command: "unknown",
      error: { code: "UNKNOWN", message: "unexpected boom" },
    });
  });
});
