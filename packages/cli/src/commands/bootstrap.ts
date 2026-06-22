import {
  type BootstrapAgent,
  type BootstrapStatus,
  installBootstrapAgent,
  readBootstrapAgentStatus,
  uninstallBootstrapAgent,
} from "@okf-harness/agent-pack";
import type { Command } from "commander";
import { writeValidationError } from "../errors/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

type BootstrapAction = "install" | "repair" | "status" | "uninstall";

export function registerBootstrapCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  program
    .command("bootstrap <action>")
    .description("Manage global OKF Harness bootstrap entrypoints.")
    .storeOptionsAsProperties(false)
    .requiredOption("--agents <agents>", "agent clients to manage: codex")
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
          next: ["Use okfh bootstrap install|repair|status|uninstall --agents codex --json."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      const agent = parseBootstrapAgent(options.agents);
      if (agent === undefined) {
        writeValidationError(io, {
          command: `bootstrap ${action}`,
          code: "INVALID_BOOTSTRAP_AGENT",
          message: "Bootstrap agents must be: codex.",
          next: ["Rerun with --agents codex."],
          json: options.json === true,
        });
        setExitCode(1);
        return;
      }

      if (action === "status") {
        const status = await readBootstrapAgentStatus({ agent });
        const ok = status.state === "installed";
        writeResult(io, bootstrapEnvelope(action, ok, status), options.json);
        setExitCode(ok ? 0 : 1);
        return;
      }

      const result =
        action === "install" || action === "repair"
          ? await installBootstrapAgent({
              agent,
              dryRun: options.dryRun === true,
            })
          : await uninstallBootstrapAgent({
              agent,
              dryRun: options.dryRun === true,
            });
      const ok = result.conflicts.length === 0;
      const envelope: JsonEnvelope = {
        ok,
        command: `bootstrap ${action}`,
        workspace: null,
        data: result,
        warnings: [],
        next: ok
          ? result.status.next
          : ["Resolve the unmanaged okf-harness-bootstrap skill before retrying."],
      };

      writeResult(io, envelope, options.json);
      setExitCode(ok ? 0 : 1);
    });
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
            message: `Codex bootstrap status is ${status.state}.`,
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

function parseBootstrapAgent(input: string): BootstrapAgent | undefined {
  return input === "codex" ? input : undefined;
}
