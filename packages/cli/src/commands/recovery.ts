import { createCheckpoint, listCompletions, restoreCompletion } from "@okf-harness/core";
import type { Command } from "commander";
import { defineCommand } from "../define-command.js";
import type { CliIo } from "../types.js";

export function registerRecoveryCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  defineCommand(program, io, setExitCode, {
    command: "checkpoint",
    description: "Create a completion checkpoint for the workspace.",
    options: [
      {
        flags: "--judgment <text>",
        description: "judgment summarizing why the completion happened",
      },
    ],
    run: async (_args, options, workspaceRoot) => {
      const completion = await createCheckpoint(workspaceRoot, options.judgment as string);
      return { data: { completion }, warnings: [], next: [] };
    },
  });

  defineCommand(program, io, setExitCode, {
    command: "restore <completion-id>",
    description: "Restore the workspace to a prior completion.",
    run: async (args, _options, workspaceRoot) => {
      const completion = await restoreCompletion(workspaceRoot, args[0] as string);
      return { data: { completion }, warnings: [], next: [] };
    },
    errorNext: [
      "Run okfh history --json to list completions, then rerun okfh restore <completion-id> --json.",
    ],
  });

  defineCommand(program, io, setExitCode, {
    command: "history",
    description: "List workspace completions.",
    run: async (_args, _options, workspaceRoot) => {
      const completions = await listCompletions(workspaceRoot);
      return { data: { completions }, warnings: [], next: [] };
    },
  });
}
