import path from "node:path";
import {
  addSource,
  clearReconciliation,
  createIngestPlan,
  listSources,
  SourceManagementError,
} from "@okf-harness/core";
import type { Command } from "commander";
import { writeCliError, writeValidationError } from "../errors/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

export function registerSourceCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  program
    .command("source <action> [input] [revision]")
    .description("Register, list, and reconcile OKF Harness raw sources.")
    .storeOptionsAsProperties(false)
    .requiredOption("--workspace <path>", "workspace path")
    .option("--dry-run", "return the planned source registration without writing files")
    .option("--note <text>", "reconciliation judgment note")
    .option("--json", "write machine-readable JSON")
    .action(async (...args: [string, string | undefined, string | undefined, Command]) => {
      const [actionInput, input, revision, command] = args;
      const options = command.opts() as {
        workspace: string;
        dryRun?: boolean;
        note?: string;
        json?: boolean;
      };
      if (actionInput === "list") {
        try {
          const result = await listSources({ workspaceRoot: options.workspace });
          const envelope: JsonEnvelope = {
            ok: true,
            command: "source list",
            workspace: result.workspaceRoot,
            data: { sources: result.sources },
            warnings: [],
            next: [],
          };

          writeResult(io, envelope, options.json);
          setExitCode(0);
        } catch (error) {
          if (error instanceof SourceManagementError) {
            writeCliError(io, {
              command: "source list",
              error,
              workspace: path.resolve(options.workspace),
              next: ["Check the workspace path and rerun okfh source list --json."],
              json: options.json === true,
            });
            setExitCode(1);
            return;
          }
          throw error;
        }
        return;
      }

      if (actionInput === "reconcile") {
        try {
          const result = await clearReconciliation({
            workspaceRoot: options.workspace,
            priorSourceId: input ?? "",
            revisionSourceId: revision ?? "",
            note: options.note ?? "",
          });
          const envelope: JsonEnvelope = {
            ok: true,
            command: "source reconcile",
            workspace: result.workspaceRoot,
            data: { acknowledgement: result.acknowledgement },
            warnings: [],
            next: ["Run okfh check --workspace <path> --json."],
          };

          writeResult(io, envelope, options.json);
          setExitCode(0);
        } catch (error) {
          if (error instanceof SourceManagementError) {
            writeCliError(io, {
              command: "source reconcile",
              error,
              workspace: path.resolve(options.workspace),
              next: ["Review the suspected revision, then rerun okfh source reconcile --json."],
              json: options.json === true,
            });
            setExitCode(1);
            return;
          }
          throw error;
        }
        return;
      }

      if (actionInput !== "add") {
        writeValidationError(io, {
          command: "source",
          code: "INVALID_SOURCE_ACTION",
          message: "Source action must be one of: add, list, reconcile.",
          workspace: path.resolve(options.workspace),
          next: ["Use okfh source add <path-or-url> --workspace <path> --json."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }
      if (input === undefined) {
        writeValidationError(io, {
          command: "source add",
          code: "SOURCE_INPUT_REQUIRED",
          message: "source add requires a file path or URL.",
          workspace: path.resolve(options.workspace),
          next: ["Pass a local file path or URL to okfh source add."],
          json: options.json === true,
        });
        setExitCode(2);
        return;
      }

      try {
        const result = await addSource({
          workspaceRoot: options.workspace,
          input,
          dryRun: options.dryRun === true,
        });
        const envelope: JsonEnvelope = {
          ok: true,
          command: "source add",
          workspace: result.workspaceRoot,
          data: {
            action: result.action,
            dryRun: result.dryRun,
            source: result.source,
          },
          warnings: [],
          next: [`Run okfh ingest plan ${result.source.id} --workspace <path> --json.`],
        };

        writeResult(io, envelope, options.json);
        setExitCode(0);
      } catch (error) {
        if (error instanceof SourceManagementError) {
          writeCliError(io, {
            command: "source add",
            error,
            workspace: path.resolve(options.workspace),
            next: ["Check the source input and workspace path, then rerun okfh source add --json."],
            json: options.json === true,
          });
          setExitCode(error.code === "SOURCE_INPUT_UNSUPPORTED" ? 1 : 5);
          return;
        }
        throw error;
      }
    });

  program
    .command("ingest <action> <source>")
    .description("Plan source ingestion into the OKF wiki.")
    .storeOptionsAsProperties(false)
    .requiredOption("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (actionInput: string, sourceInput: string, command: Command) => {
      const options = command.opts() as { workspace: string; json?: boolean };
      if (actionInput !== "plan") {
        writeValidationError(io, {
          command: "ingest",
          code: "INVALID_INGEST_ACTION",
          message: "Ingest action must be: plan.",
          workspace: path.resolve(options.workspace),
          next: ["Use okfh ingest plan <source-id-or-path> --workspace <path> --json."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      try {
        const result = await createIngestPlan({
          workspaceRoot: options.workspace,
          source: sourceInput,
        });
        const envelope: JsonEnvelope = {
          ok: true,
          command: "ingest plan",
          workspace: result.workspaceRoot,
          data: {
            source: result.source,
            recommendedReferencePath: result.recommendedReferencePath,
            candidateConcepts: result.candidateConcepts,
            suggestedNewConcept: result.suggestedNewConcept,
            nextStep: result.nextStep,
            checklist: result.checklist,
          },
          warnings: [],
          next: [result.nextStep],
        };

        writeResult(io, envelope, options.json);
        setExitCode(0);
      } catch (error) {
        if (error instanceof SourceManagementError) {
          writeCliError(io, {
            command: "ingest plan",
            error,
            workspace: path.resolve(options.workspace),
            next: ["Register the source first with okfh source add, then rerun okfh ingest plan."],
            json: options.json === true,
          });
          setExitCode(error.code === "SOURCE_NOT_REGISTERED" ? 1 : 5);
          return;
        }
        throw error;
      }
    });
}
