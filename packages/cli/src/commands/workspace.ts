import {
  type CheckResult,
  listSources,
  readWorkspaceStatus,
  recordRuntimePin,
  resolveWorkspaceRoot,
  WorkspaceConfigError,
  type WorkspaceStatus,
} from "@okf-harness/core";
import type { Command } from "commander";
import { writeValidationError } from "../errors/index.js";
import { registerHumanRenderer, writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

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
const NEXT_FIX_WORKSPACE_CONFIG =
  "Ask your agent to fix okfh.config.yaml before recording the workspace runtime pin.";
const NEXT_CONTINUE_AFTER_ADOPT = "Continue the workspace request that needed a runtime pin.";
const NEXT_FIRST_ANSWER_CHECK =
  "Ask your agent to answer these questions from synthesized wiki evidence: what is the source mainly about, what are its key conclusions, and where does the evidence come from?";

export function registerWorkspaceCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  registerHumanRenderer("status", humanStatus);
  registerHumanRenderer("check", humanCheck);

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
      const check = result.check;
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
      const check = workspaceStatus.check;
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
    .command("adopt-runtime")
    .description("Record this Harness runtime's version as the workspace runtime pin.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--dry-run", "report the pin that would be recorded without writing it")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as {
        workspace?: string;
        dryRun?: boolean;
        json?: boolean;
      };
      const workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
      let pin: Awaited<ReturnType<typeof recordRuntimePin>>;
      try {
        pin = await recordRuntimePin(workspaceRoot, { dryRun: options.dryRun === true });
      } catch (error) {
        if (!(error instanceof WorkspaceConfigError)) {
          throw error;
        }
        writeValidationError(io, {
          command: "adopt-runtime",
          code: error.code,
          message: error.message,
          workspace: workspaceRoot,
          details: { issues: error.issues },
          next: [NEXT_FIX_WORKSPACE_CONFIG],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      const envelope: JsonEnvelope = {
        ok: true,
        command: "adopt-runtime",
        workspace: workspaceRoot,
        data: {
          runtime: { version: pin.version },
          state: pin.state,
          dryRun: options.dryRun === true,
        },
        warnings: [],
        next: [NEXT_CONTINUE_AFTER_ADOPT],
      };

      writeResult(io, envelope, options.json);
      setExitCode(0);
    });
}

function humanStatus(envelope: JsonEnvelope): string {
  const next = envelope.next[0];
  return `${envelope.ok ? "OK" : "FAILED"} status\n${next === undefined ? "" : `Next: ${next}\n`}`;
}

export function humanCheck(envelope: JsonEnvelope): string {
  const data = envelope.data as Partial<CheckResult>;
  const currencyDetails = [
    ...new Set([
      ...(data.currency?.dangling.map(({ original }) => original) ?? []),
      ...(data.currency?.diagnostics?.map(({ code }) => code) ?? []),
    ]),
  ];
  const rows = [
    `Status: ${humanCheckStatus(data.status)}`,
    `OKF version: ${data.okfVersion ?? "unknown"}`,
    `OKF conformance: ${data.okfConformance?.ok === false ? "fail" : "pass"}`,
    `Harness lint: ${data.harnessLint?.ok === false ? "needs attention" : "pass"}`,
    `Currency: ${humanCurrency(data.currency, currencyDetails)}`,
  ];
  for (const priority of ["high", "medium", "low"] as const) {
    const findings = data.harnessLint?.findings[priority] ?? [];
    if (findings.length > 0) {
      rows.push(`${priority}: ${findings.length}`);
      rows.push(
        ...findings.map((finding) => {
          const pathValue = finding.path === undefined ? "" : ` ${finding.path}`;
          return `- ${finding.code ?? "ISSUE"}${pathValue}`;
        }),
      );
    }
  }
  const next = envelope.next[0];
  return `${rows.join("\n")}\n${next === undefined ? "" : `Next: ${next}\n`}`;
}

function humanCurrency(currency: CheckResult["currency"] | undefined, details: string[]): string {
  if (currency === undefined) {
    return "no currency verdict";
  }
  if (currency.sealed === false) {
    return `not sealed (${details.join(", ")})`;
  }
  return currency.promotedSources === 0 ? "no promoted sources to reconcile" : "sealed";
}

function humanCheckStatus(status: string | undefined): string {
  if (status === "ready") {
    return "Ready";
  }
  if (status === "needs_attention") {
    return "Needs attention";
  }
  if (status === "blocked") {
    return "Blocked";
  }
  return "Unknown";
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
