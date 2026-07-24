import { Command } from "commander";
import { registerAgentCommands } from "./commands/agent.js";
import { registerBootstrapCommands } from "./commands/bootstrap.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerInitCommand } from "./commands/init.js";
import { registerQueryCommands } from "./commands/query.js";
import { registerRecoveryCommands } from "./commands/recovery.js";
import { registerSourceCommands } from "./commands/source.js";
import { registerWorkspaceCommands } from "./commands/workspace.js";
import { handleCliError } from "./errors/index.js";
import { commandFromArgv } from "./options/index.js";
import type { CliIo } from "./types.js";

export type { CliIo, JsonEnvelope } from "./types.js";

export const packageInfo = {
  name: "@okf-harness/cli",
  role: "cli",
} as const;

export type PackageInfo = typeof packageInfo;

export async function runCli(
  argv: string[] = process.argv,
  io: CliIo = {
    writeOut: (chunk) => process.stdout.write(chunk),
    writeErr: (chunk) => process.stderr.write(chunk),
  },
): Promise<number> {
  const normalizedArgv = withoutRetiredInitFlag(argv);
  const program = new Command();
  let exitCode = 0;
  const jsonRequested = normalizedArgv.includes("--json");
  const capturedCommanderErrors: string[] = [];

  program.name("okfh").description("OKF Harness command line interface.");
  program.exitOverride();

  const setExitCode = (code: number): void => {
    exitCode = code;
  };

  registerInitCommand(program, io, setExitCode);

  registerWorkspaceCommands(program, io, setExitCode);

  registerQueryCommands(program, io, setExitCode);

  registerRecoveryCommands(program, io, setExitCode);

  registerDoctorCommand(program, io, setExitCode);

  registerSourceCommands(program, io, setExitCode);

  registerAgentCommands(program, io, setExitCode);

  registerBootstrapCommands(program, io, setExitCode);

  const restoreConsoleError = captureCommanderConsoleError(capturedCommanderErrors);
  try {
    await program.parseAsync(normalizedArgv);
    return exitCode;
  } catch (error) {
    return handleCliError(error, io, {
      command: commandFromArgv(normalizedArgv),
      json: jsonRequested,
      capturedStderr: capturedCommanderErrors.join(""),
    });
  } finally {
    restoreConsoleError();
  }
}

function withoutRetiredInitFlag(argv: string[]): string[] {
  const commandIndex = argv.indexOf("init", 2);
  if (commandIndex === -1) {
    return argv;
  }
  const optionsEnd = argv.indexOf("--", commandIndex + 1);
  return argv.filter(
    (argument, index) =>
      argument !== "--git" || index <= commandIndex || (optionsEnd !== -1 && index > optionsEnd),
  );
}

function captureCommanderConsoleError(capturedErrors: string[]): () => void {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    capturedErrors.push(`${args.map((arg) => String(arg)).join(" ")}\n`);
  };

  return () => {
    console.error = originalConsoleError;
  };
}
