import {
  type CheckResult,
  checkLintResult,
  listSources,
  readWorkspaceStatus,
  resolveWorkspaceRoot,
  type WorkspaceStatus,
} from "@okf-harness/core";
import type { Command } from "commander";
import { writeValidationError } from "../errors/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

const NEXT_INITIALIZE_WORKSPACE =
  "Ask your agent to initialize this folder as an OKF Harness workspace before continuing.";
const NEXT_FIX_OKF_CONFORMANCE =
  "Ask your agent to fix OKF conformance before answering from this workspace.";
const NEXT_HANDLE_CHECK_FINDINGS =
  "Ask your agent to handle the check findings before answering from this workspace.";
const NEXT_ADD_LOCAL_SOURCE = "Ask your agent to add one local source file to this workspace.";
const NEXT_REPLACE_URL_POINTERS =
  "URL sources are pointers only; ask your agent to add a local file or save the webpage content as a file.";
const NEXT_UPDATE_WIKI =
  "Ask your agent to update the wiki with citations from the local source, then run check.";
const NEXT_FIRST_ANSWER_CHECK =
  "Ask your agent to run the first-answer check from the synthesized wiki evidence.";

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
        next: [await workspaceNextStep(result, check)],
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
          next: [NEXT_INITIALIZE_WORKSPACE],
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
        next: [await workspaceNextStep(workspaceStatus, check)],
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

async function workspaceNextStep(
  workspaceStatus: WorkspaceStatus,
  check: CheckResult,
): Promise<string> {
  if (!workspaceStatus.initialized) {
    return NEXT_INITIALIZE_WORKSPACE;
  }

  if (check.status === "blocked") {
    return NEXT_FIX_OKF_CONFORMANCE;
  }

  if (check.status === "needs_attention") {
    return NEXT_HANDLE_CHECK_FINDINGS;
  }

  const sources = (await listSources({ workspaceRoot: workspaceStatus.workspaceRoot })).sources;
  if (sources.length === 0) {
    return NEXT_ADD_LOCAL_SOURCE;
  }

  if (!sources.some((source) => source.kind === "file")) {
    return NEXT_REPLACE_URL_POINTERS;
  }

  if (workspaceStatus.concepts === 0) {
    return NEXT_UPDATE_WIKI;
  }

  return NEXT_FIRST_ANSWER_CHECK;
}
