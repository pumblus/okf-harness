import path from "node:path";
import {
  type InitWorkspaceResult,
  initWorkspace,
  lintWorkspace,
  readWorkspaceStatus,
  WorkspaceInitError,
} from "@okf-harness/core";
import { Command } from "commander";

export const packageInfo = {
  name: "@okf-harness/cli",
  role: "cli",
  phase: 2,
} as const;

export type PackageInfo = typeof packageInfo;

export type CliIo = {
  writeOut: (chunk: string) => void;
  writeErr: (chunk: string) => void;
};

export type JsonEnvelope = {
  ok: boolean;
  command: string;
  workspace?: string;
  data: unknown;
  warnings: Array<{ code: string; message: string }>;
  next: string[];
};

export async function runCli(
  argv: string[] = process.argv,
  io: CliIo = {
    writeOut: (chunk) => process.stdout.write(chunk),
    writeErr: (chunk) => process.stderr.write(chunk),
  },
): Promise<number> {
  const program = new Command();
  let exitCode = 0;
  const jsonRequested = argv.includes("--json");
  const capturedCommanderErrors: string[] = [];

  program.name("okfh").description("OKF Harness command line interface.");
  program.exitOverride();

  program
    .command("init <workspace>")
    .description("Initialize an OKF Harness workspace.")
    .storeOptionsAsProperties(false)
    .requiredOption("--name <name>", "workspace display name")
    .option("--dry-run", "return the planned writes without creating files")
    .option("--git", "initialize a git repository without committing")
    .option("--json", "write machine-readable JSON")
    .action(async (workspace: string, command: Command) => {
      const options = command.opts() as {
        name: string;
        dryRun?: boolean;
        git?: boolean;
        json?: boolean;
      };
      let result: InitWorkspaceResult;
      try {
        result = await initWorkspace({
          workspaceRoot: workspace,
          name: options.name,
          dryRun: options.dryRun === true,
          git: options.git === true,
        });
      } catch (error) {
        if (error instanceof WorkspaceInitError) {
          writeError(io, "init", error.message, error.code, path.resolve(workspace));
          exitCode = error.code === "DEPENDENCY_MISSING" ? 4 : 1;
          return;
        }
        throw error;
      }

      const envelope: JsonEnvelope = {
        ok: result.lint.ok,
        command: "init",
        workspace: result.workspaceRoot,
        data: {
          name: result.name,
          dryRun: result.dryRun,
          git: result.git,
          files: result.files,
          plannedFiles: result.dryRun ? result.files : [],
          directories: result.directories,
          lint: result.lint,
        },
        warnings: result.warnings,
        next: [
          "After Phase 3, install Claude and Codex adapters with okfh agent install.",
          "Run okfh lint --json after editing wiki files.",
        ],
      };

      writeResult(io, envelope, options.json);
      exitCode = result.lint.ok ? 0 : 1;
    });

  program
    .command("status")
    .description("Report OKF Harness workspace status.")
    .storeOptionsAsProperties(false)
    .requiredOption("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace: string; json?: boolean };
      const result = await readWorkspaceStatus(options.workspace);
      const envelope: JsonEnvelope = {
        ok: result.initialized && result.lint.ok,
        command: "status",
        workspace: result.workspaceRoot,
        data: {
          initialized: result.initialized,
          name: result.name,
          wikiFiles: result.wikiFiles,
          concepts: result.concepts,
          lint: result.lint,
        },
        warnings: result.warnings,
        next: result.initialized ? ["Run okfh lint --json after editing wiki files."] : [],
      };

      writeResult(io, envelope, options.json);
      exitCode = envelope.ok ? 0 : 1;
    });

  program
    .command("lint")
    .description("Lint an OKF Harness workspace.")
    .storeOptionsAsProperties(false)
    .requiredOption("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace: string; json?: boolean };
      const lint = await lintWorkspace(options.workspace);
      const envelope: JsonEnvelope = {
        ok: lint.ok,
        command: "lint",
        workspace: options.workspace,
        data: lint,
        warnings: [],
        next: lint.ok ? [] : ["Fix lint errors and rerun okfh lint --json."],
      };

      writeResult(io, envelope, options.json);
      exitCode = lint.ok ? 0 : 1;
    });

  const restoreConsoleError = captureCommanderConsoleError(capturedCommanderErrors);
  try {
    await program.parseAsync(argv);
    return exitCode;
  } catch (error) {
    return handleCliError(error, io, {
      command: commandFromArgv(argv),
      json: jsonRequested,
      capturedStderr: capturedCommanderErrors.join(""),
    });
  } finally {
    restoreConsoleError();
  }
}

function writeResult(io: CliIo, envelope: JsonEnvelope, json = false): void {
  if (json) {
    io.writeOut(`${JSON.stringify(envelope)}\n`);
    return;
  }

  io.writeOut(`${envelope.ok ? "OK" : "FAILED"} ${envelope.command}\n`);
}

function handleCliError(
  error: unknown,
  io: CliIo,
  options: { command: string; json: boolean; capturedStderr: string },
): number {
  if (error instanceof WorkspaceInitError) {
    writeError(io, "init", error.message, error.code);
    return 1;
  }

  if (isCommanderError(error)) {
    if (options.json) {
      writeError(io, options.command, error.message, error.code);
    } else {
      io.writeErr(options.capturedStderr);
    }
    return error.exitCode;
  }

  writeError(io, "unknown", error instanceof Error ? error.message : "Unknown error.", "UNKNOWN");
  return 5;
}

function writeError(
  io: CliIo,
  command: string,
  message: string,
  code: string,
  workspace?: string,
): void {
  const envelope: JsonEnvelope = {
    ok: false,
    command,
    data: {
      code,
      message,
    },
    warnings: [],
    next: [],
  };
  if (workspace !== undefined) {
    envelope.workspace = workspace;
  }
  io.writeErr(`${JSON.stringify(envelope)}\n`);
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

function commandFromArgv(argv: string[]): string {
  const command = argv.slice(2).find((arg) => !arg.startsWith("-"));
  return command ?? "unknown";
}

function isCommanderError(
  error: unknown,
): error is { code: string; exitCode: number; message: string } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; exitCode?: unknown; message?: unknown };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.exitCode === "number" &&
    typeof candidate.message === "string"
  );
}
