import { listCompletions, resolveWorkspaceRoot } from "@okf-harness/core";
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
