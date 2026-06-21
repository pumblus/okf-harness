import path from "node:path";
import { installAgentAdapters } from "@okf-harness/agent-pack";
import { readWorkspaceStatus } from "@okf-harness/core";
import type { Command } from "commander";
import { writeValidationError } from "../errors/index.js";
import { parseAgentInstallTarget } from "../options/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

export function registerAgentCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  program
    .command("agent <action> <adapter>")
    .description("Install or repair Claude Code and Codex adapter files.")
    .storeOptionsAsProperties(false)
    .requiredOption("--workspace <path>", "workspace path")
    .option("--dry-run", "return the planned writes without creating files")
    .option("--force", "replace conflicting same-name adapter files")
    .option("--json", "write machine-readable JSON")
    .action(async (actionInput: string, adapterInput: string, command: Command) => {
      const options = command.opts() as {
        workspace: string;
        dryRun?: boolean;
        force?: boolean;
        json?: boolean;
      };
      if (actionInput !== "install") {
        writeValidationError(io, {
          command: "agent",
          code: "INVALID_AGENT_ACTION",
          message: "Agent action must be: install.",
          workspace: path.resolve(options.workspace),
          next: ["Use okfh agent install claude|codex|all --workspace <path> --json."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      const adapter = parseAgentInstallTarget(adapterInput);
      if (adapter === undefined) {
        writeValidationError(io, {
          command: "agent install",
          code: "INVALID_AGENT_ADAPTER",
          message: "Adapter must be one of: claude, codex, all.",
          workspace: path.resolve(options.workspace),
          next: ["Rerun with adapter claude, codex, or all."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      const workspaceStatus = await readWorkspaceStatus(options.workspace);
      if (!workspaceStatus.initialized) {
        writeValidationError(io, {
          command: "agent install",
          code: "WORKSPACE_NOT_INITIALIZED",
          message: "Workspace is not initialized. Run okfh init first.",
          workspace: workspaceStatus.workspaceRoot,
          next: ["Run okfh init <workspace> --name <name> --agents all --json first."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      const result = await installAgentAdapters({
        workspaceRoot: workspaceStatus.workspaceRoot,
        adapter,
        dryRun: options.dryRun === true,
        force: options.force === true,
      });
      const ok = result.conflicts.length === 0;
      const envelope: JsonEnvelope = {
        ok,
        command: "agent install",
        workspace: workspaceStatus.workspaceRoot,
        data: result,
        warnings: [],
        next: ok
          ? ["Run okfh status --workspace <path> --json to verify the workspace."]
          : ["Resolve conflicts or rerun with --force after reviewing the files."],
      };

      writeResult(io, envelope, options.json);
      setExitCode(ok ? 0 : 1);
    });
}
