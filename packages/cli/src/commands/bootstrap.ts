import {
  type BootstrapAgent,
  type BootstrapAgentDetection,
  type BootstrapLifecycleResult,
  type BootstrapStatus,
  detectBootstrapAgent,
  installBootstrapAgent,
  readBootstrapAgentStatus,
  supportedBootstrapAgents,
  uninstallBootstrapAgent,
} from "@okf-harness/agent-pack";
import type { Command } from "commander";
import { writeValidationError } from "../errors/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

type BootstrapAction = "install" | "repair" | "status" | "uninstall";
type BootstrapAgentSelection = BootstrapAgent | "all";
type BootstrapAllEntry =
  | {
      agent: BootstrapAgent;
      detected: false;
      skipped: true;
      reason: "not-detected";
      detection: BootstrapAgentDetection;
    }
  | {
      agent: BootstrapAgent;
      detected: true;
      skipped: false;
      detection: BootstrapAgentDetection;
      status?: BootstrapStatus;
      result?: BootstrapLifecycleResult;
    };

export function registerBootstrapCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  program
    .command("bootstrap <action>")
    .description("Manage global OKF Harness bootstrap entrypoints.")
    .storeOptionsAsProperties(false)
    .requiredOption("--agents <agents>", "agent clients to manage: codex, claude, all")
    .option("--dry-run", "return the planned writes or removals without changing files")
    .option("--json", "write machine-readable JSON")
    .action(async (actionInput: string, command: Command) => {
      const options = command.opts() as {
        agents: string;
        dryRun?: boolean;
        json?: boolean;
      };
      const action = parseBootstrapAction(actionInput);
      if (action === undefined) {
        writeValidationError(io, {
          command: "bootstrap",
          code: "INVALID_BOOTSTRAP_ACTION",
          message: "Bootstrap action must be one of: install, repair, status, uninstall.",
          next: [
            "Use okfh bootstrap install|repair|status|uninstall --agents codex|claude|all --json.",
          ],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      const selection = parseBootstrapAgentSelection(options.agents);
      if (selection === undefined) {
        writeValidationError(io, {
          command: `bootstrap ${action}`,
          code: "INVALID_BOOTSTRAP_AGENT",
          message: "Bootstrap agents must be: codex, claude, or all.",
          next: ["Rerun with --agents codex, --agents claude, or --agents all."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      if (selection === "all") {
        const envelope = await bootstrapAllEnvelope(action, options.dryRun === true);
        writeResult(io, envelope, options.json);
        setExitCode(envelope.ok ? 0 : 1);
        return;
      }

      if (action === "status") {
        const status = await readBootstrapAgentStatus({ agent: selection });
        const ok = status.state === "installed";
        writeResult(io, bootstrapEnvelope(action, ok, status), options.json);
        setExitCode(ok ? 0 : 1);
        return;
      }

      const result =
        action === "install" || action === "repair"
          ? await installBootstrapAgent({
              agent: selection,
              dryRun: options.dryRun === true,
            })
          : await uninstallBootstrapAgent({
              agent: selection,
              dryRun: options.dryRun === true,
            });
      const ok = result.conflicts.length === 0 && result.status.state !== "unwritable-target";
      const envelope: JsonEnvelope = {
        ok,
        command: `bootstrap ${action}`,
        workspace: null,
        data: result,
        warnings: [],
        next: result.status.next,
      };

      writeResult(io, envelope, options.json);
      setExitCode(ok ? 0 : 1);
    });
}

async function bootstrapAllEnvelope(
  action: BootstrapAction,
  dryRun: boolean,
): Promise<JsonEnvelope> {
  const agents: BootstrapAllEntry[] = [];

  for (const agent of supportedBootstrapAgents) {
    const detection = await detectBootstrapAgent({ agent });
    if (!detection.detected) {
      agents.push({ agent, detected: false, skipped: true, reason: "not-detected", detection });
      continue;
    }

    if (action === "status") {
      const status = await readBootstrapAgentStatus({ agent });
      agents.push({
        agent,
        detected: true,
        skipped: false,
        detection: status.detection,
        status,
      });
      continue;
    }

    const result =
      action === "install" || action === "repair"
        ? await installBootstrapAgent({ agent, dryRun })
        : await uninstallBootstrapAgent({ agent, dryRun });
    agents.push({
      agent,
      detected: true,
      skipped: false,
      detection: result.status.detection,
      result,
    });
  }

  const failed = agents.filter(agentEntryFailed);
  const warnings = [
    ...agents
      .filter((entry) => !entry.detected)
      .map((entry) => ({
        code: "BOOTSTRAP_AGENT_NOT_DETECTED",
        message: `${entry.detection.label} was not detected; skipped bootstrap ${action}.`,
      })),
    ...failed.map((entry) => ({
      code: "BOOTSTRAP_AGENT_FAILED",
      message: `${entry.detection.label} bootstrap ${action} needs attention.`,
    })),
  ];
  return {
    ok: failed.length === 0,
    command: `bootstrap ${action}`,
    workspace: null,
    data: { agents, dryRun },
    warnings,
    next: uniqueStrings(agents.flatMap(agentEntryNext)),
  };
}

function bootstrapEnvelope(
  action: BootstrapAction,
  ok: boolean,
  status: BootstrapStatus,
): JsonEnvelope {
  return {
    ok,
    command: `bootstrap ${action}`,
    workspace: null,
    data: { agent: status.agent, status },
    warnings: ok
      ? []
      : [
          {
            code: "BOOTSTRAP_STATUS",
            message: `${status.detection.label} bootstrap status is ${status.state}.`,
          },
        ],
    next: status.next,
  };
}

function parseBootstrapAction(input: string): BootstrapAction | undefined {
  if (input === "install" || input === "repair" || input === "status" || input === "uninstall") {
    return input;
  }
  return undefined;
}

function parseBootstrapAgentSelection(input: string): BootstrapAgentSelection | undefined {
  if (input === "all" || input === "codex" || input === "claude") {
    return input;
  }
  return undefined;
}

function agentEntryFailed(entry: BootstrapAllEntry): boolean {
  if (!entry.detected) {
    return false;
  }
  if (entry.status !== undefined) {
    return entry.status.state !== "installed";
  }
  return (
    (entry.result?.conflicts.length ?? 0) > 0 || entry.result?.status.state === "unwritable-target"
  );
}

function agentEntryNext(entry: BootstrapAllEntry): string[] {
  if (!entry.detected) {
    return [];
  }
  return entry.status?.next ?? entry.result?.status.next ?? [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
