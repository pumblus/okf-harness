import path from "node:path";
import { type InstallAgentAdaptersResult, installAgentAdapters } from "@okf-harness/agent-pack";
import {
  type InitWorkspaceResult,
  initializeRecovery,
  initWorkspace,
  RecoveryError,
  WorkspaceInitError,
} from "@okf-harness/core";
import type { Command } from "commander";
import { writeCliError, writeValidationError } from "../errors/index.js";
import { type InitAgentTarget, parseInitAgentTarget } from "../options/index.js";
import { createWorkspaceRefreshHint, type WorkspaceRefreshHint } from "../refresh.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

export function registerInitCommand(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  program
    .command("init <workspace>")
    .description("Initialize an OKF Harness workspace.")
    .storeOptionsAsProperties(false)
    .requiredOption("--name <name>", "workspace display name")
    .option("--agents <agents>", "agent adapters to install: claude, codex, all, none")
    .option("--dry-run", "return the planned writes without creating files")
    .option("--json", "write machine-readable JSON")
    .action(async (workspace: string, command: Command) => {
      const options = command.opts() as {
        name: string;
        agents?: string;
        dryRun?: boolean;
        json?: boolean;
      };
      if (options.agents === undefined) {
        writeValidationError(io, {
          command: "init",
          code: "AGENT_TARGET_REQUIRED",
          message:
            "Choose an agent adapter with --agents codex or --agents claude. Use --agents all only if you want both.",
          workspace: path.resolve(workspace),
          next: [
            "Rerun okfh init with --agents codex, --agents claude, --agents all, or --agents none.",
          ],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }
      const agentTarget = parseInitAgentTarget(options.agents);
      if (agentTarget === undefined) {
        writeValidationError(io, {
          command: "init",
          code: "INVALID_AGENT_TARGET",
          message: "Agents must be one of: claude, codex, all, none, claude,codex.",
          workspace: path.resolve(workspace),
          next: ["Rerun okfh init with --agents all, claude, codex, none, or claude,codex."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      let result: InitWorkspaceResult;
      let agentInstall: InstallAgentAdaptersResult | undefined;
      try {
        result = await initWorkspace({
          workspaceRoot: workspace,
          name: options.name,
          dryRun: options.dryRun === true,
        });
        agentInstall =
          agentTarget === "none"
            ? undefined
            : await installAgentAdapters({
                workspaceRoot: result.workspaceRoot,
                adapter: agentTarget,
                dryRun: result.dryRun,
              });
        if (!result.dryRun) {
          await initializeRecovery(result.workspaceRoot);
        }
      } catch (error) {
        if (error instanceof WorkspaceInitError || error instanceof RecoveryError) {
          writeCliError(io, {
            command: "init",
            error,
            workspace: path.resolve(workspace),
            next:
              error.code === "INIT_NOT_EMPTY"
                ? ["Choose an empty directory, or run okfh doctor --workspace <path> --json."]
                : error.code === "INIT_NESTED_WORKSPACE"
                  ? ["Use the existing workspace, or choose an empty directory outside it."]
                  : error instanceof RecoveryError
                    ? ["Check the local runtime and rerun okfh init --json."]
                    : ["Fix the initialization input and rerun okfh init --json."],
            json: options.json === true,
          });
          setExitCode(error.code === "RECOVERY_UNAVAILABLE" ? 4 : 1);
          return;
        }
        throw error;
      }

      const ok = result.lint.ok && (agentInstall?.conflicts.length ?? 0) === 0;
      const plannedFiles = visibleInitFiles(
        result.dryRun ? [...result.files, ...(agentInstall?.plannedFiles ?? [])] : [],
      );
      const files = visibleInitFiles(
        result.dryRun
          ? result.files
          : [
              ...result.files,
              ...(agentInstall?.writtenFiles ?? []),
              ...(agentInstall?.replacedFiles ?? []),
            ],
      );
      const refresh = renderRefreshHint({
        agentTarget,
        ok,
        dryRun: result.dryRun,
        workspaceRoot: result.workspaceRoot,
      });
      const envelope: JsonEnvelope = {
        ok,
        command: "init",
        workspace: result.workspaceRoot,
        data: {
          name: result.name,
          dryRun: result.dryRun,
          agents: renderInitAgentData(agentTarget, agentInstall),
          refresh,
          files,
          plannedFiles,
          directories: result.directories,
          lint: result.lint,
        },
        warnings: result.warnings,
        next: [
          "Use the generated OKF Harness skills from Claude Code or Codex.",
          "Run okfh check --workspace <path> --json after editing wiki files.",
        ],
      };

      writeResult(io, envelope, options.json);
      setExitCode(ok ? 0 : 1);
    });
}

function renderInitAgentData(
  requested: InitAgentTarget,
  install: InstallAgentAdaptersResult | undefined,
): { requested: InitAgentTarget; install?: InstallAgentAdaptersResult } {
  if (install === undefined) {
    return { requested };
  }
  return { requested, install };
}

function visibleInitFiles(values: string[]): string[] {
  return [...new Set(values)].filter((file) => !/(^|\/)\.git/.test(file));
}

function renderRefreshHint(options: {
  agentTarget: InitAgentTarget;
  ok: boolean;
  dryRun: boolean;
  workspaceRoot: string;
}): WorkspaceRefreshHint | undefined {
  if (
    !options.ok ||
    options.dryRun ||
    options.agentTarget === "all" ||
    options.agentTarget === "none"
  ) {
    return undefined;
  }

  return createWorkspaceRefreshHint({
    agentClient: options.agentTarget,
    workspaceRoot: options.workspaceRoot,
  });
}
