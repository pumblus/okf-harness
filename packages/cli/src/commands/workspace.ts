import { checkLintResult, readWorkspaceStatus, resolveWorkspaceRoot } from "@okf-harness/core";
import type { Command } from "commander";
import { writeValidationError } from "../errors/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

export function registerWorkspaceCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  program
    .command("status")
    .description("Report OKF Harness workspace status.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace?: string; json?: boolean };
      const workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
      const result = await readWorkspaceStatus(workspaceRoot);
      const check = checkLintResult(result.lint);
      const envelope: JsonEnvelope = {
        ok: result.initialized && check.status !== "blocked",
        command: "status",
        workspace: result.workspaceRoot,
        data: {
          initialized: result.initialized,
          name: result.name,
          wikiFiles: result.wikiFiles,
          concepts: result.concepts,
          check: {
            status: check.status,
            okfVersion: check.okfVersion,
          },
          capabilities: {
            evidence: "available",
            search: "available",
            read: "available",
            graph: "available",
          },
        },
        warnings: result.warnings,
        next: result.initialized
          ? ["Use okfh evidence to answer from bounded synthesized wiki evidence."]
          : [],
      };

      writeResult(io, envelope, options.json);
      setExitCode(envelope.ok ? 0 : 1);
    });

  program
    .command("check")
    .description("Check OKF conformance and OKF Harness maintainability.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace?: string; json?: boolean };
      const workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
      const workspaceStatus = await readWorkspaceStatus(workspaceRoot);
      if (!workspaceStatus.initialized) {
        writeValidationError(io, {
          command: "check",
          code: "WORKSPACE_NOT_INITIALIZED",
          message: "Workspace is not initialized. Run okfh init first.",
          workspace: workspaceStatus.workspaceRoot,
          next: ["Run okfh init <workspace> --name <name> --agents <agent> --json first."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }
      const check = checkLintResult(workspaceStatus.lint);
      const blocked = check.status === "blocked";
      const envelope: JsonEnvelope = {
        ok: !blocked,
        command: "check",
        workspace: workspaceRoot,
        data: check,
        warnings: [],
        next: blocked
          ? ["Fix OKF conformance findings, then rerun okfh check --workspace <path> --json."]
          : [],
      };

      writeResult(io, envelope, options.json);
      setExitCode(blocked ? 1 : 0);
    });

  program
    .command("lint")
    .description("Lint an OKF Harness workspace.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace?: string; json?: boolean };
      const workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
      const envelope: JsonEnvelope = {
        ok: false,
        command: "lint",
        workspace: workspaceRoot,
        data: {
          retired: true,
          replacement: "check",
        },
        warnings: [],
        next: ["Use okfh check --workspace <path> --json instead."],
      };

      writeResult(io, envelope, options.json);
      setExitCode(1);
    });
}
