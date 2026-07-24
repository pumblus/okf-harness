import {
  createCheckpoint,
  listCompletions,
  resolveWorkspaceRoot,
  restoreCompletion,
} from "@okf-harness/core";
import type { Command } from "commander";
import { writeCliError } from "../errors/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

export function registerRecoveryCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  program
    .command("checkpoint")
    .description("Create a completion checkpoint for the workspace.")
    .storeOptionsAsProperties(false)
    .requiredOption("--judgment <text>", "judgment summarizing why the completion happened")
    .option("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { judgment: string; workspace?: string; json?: boolean };
      let workspaceRoot: string | null = null;
      try {
        workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
        const completion = await createCheckpoint(workspaceRoot, options.judgment);
        const envelope: JsonEnvelope = {
          ok: true,
          command: "checkpoint",
          workspace: workspaceRoot,
          data: { completion },
          warnings: [],
          next: [],
        };
        writeResult(io, envelope, options.json);
        setExitCode(0);
      } catch (error) {
        const handled = writeCliError(io, {
          command: "checkpoint",
          error,
          workspace: workspaceRoot,
          next: ["Check the workspace path and rerun okfh checkpoint --json."],
          json: options.json === true,
        });
        if (handled) {
          setExitCode(1);
          return;
        }
        throw error;
      }
    });

  program
    .command("restore <completion-id>")
    .description("Restore the workspace to a prior completion.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (completionId: string, command: Command) => {
      const options = command.opts() as { workspace?: string; json?: boolean };
      let workspaceRoot: string | null = null;
      try {
        workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
        const completion = await restoreCompletion(workspaceRoot, completionId);
        const envelope: JsonEnvelope = {
          ok: true,
          command: "restore",
          workspace: workspaceRoot,
          data: { completion },
          warnings: [],
          next: [],
        };
        writeResult(io, envelope, options.json);
        setExitCode(0);
      } catch (error) {
        const handled = writeCliError(io, {
          command: "restore",
          error,
          workspace: workspaceRoot,
          next: [
            "Run okfh history --json to list completions, then rerun okfh restore <completion-id> --json.",
          ],
          json: options.json === true,
        });
        if (handled) {
          setExitCode(1);
          return;
        }
        throw error;
      }
    });

  program
    .command("history")
    .description("List workspace completions.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace?: string; json?: boolean };
      let workspaceRoot: string | null = null;
      try {
        workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
        const completions = await listCompletions(workspaceRoot);
        const envelope: JsonEnvelope = {
          ok: true,
          command: "history",
          workspace: workspaceRoot,
          data: { completions },
          warnings: [],
          next: [],
        };
        writeResult(io, envelope, options.json);
        setExitCode(0);
      } catch (error) {
        const handled = writeCliError(io, {
          command: "history",
          error,
          workspace: workspaceRoot,
          next: ["Check the workspace path and rerun okfh history --json."],
          json: options.json === true,
        });
        if (handled) {
          setExitCode(1);
          return;
        }
        throw error;
      }
    });
}
