import type { Command } from "commander";
import { runDoctor } from "../doctor/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

export function registerDoctorCommand(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  program
    .command("doctor")
    .description("Check okfh, local shell dependencies, and workspace readiness.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--dev", "include repository-development requirements")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace?: string; dev?: boolean; json?: boolean };
      const result = await runDoctor({
        workspaceRoot: options.workspace,
        dev: options.dev === true,
      });
      const envelope: JsonEnvelope = {
        ok: result.ok,
        command: "doctor",
        workspace: result.workspace,
        data: {
          checks: result.checks,
          summary: result.summary,
        },
        warnings: result.checks
          .filter((check) => check.status === "warn")
          .map((check) => ({
            code: check.id.toUpperCase().replaceAll("-", "_"),
            message: check.message,
          })),
        next: result.ok
          ? ["Use okfh --json commands through the local shell for OKF Harness workflows."]
          : ["Fix failed checks, then rerun okfh doctor --json."],
      };

      writeResult(io, envelope, options.json);
      setExitCode(result.ok ? 0 : 1);
    });
}
