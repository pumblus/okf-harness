import path from "node:path";
import {
  type AgentInstallTarget,
  type InstallAgentAdaptersResult,
  installAgentAdapters,
} from "@okf-harness/agent-pack";
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
  phase: 3,
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
    .option("--agents <agents>", "agent adapters to install: claude, codex, all, none", "all")
    .option("--dry-run", "return the planned writes without creating files")
    .option("--git", "initialize a git repository without committing")
    .option("--json", "write machine-readable JSON")
    .action(async (workspace: string, command: Command) => {
      const options = command.opts() as {
        name: string;
        agents: string;
        dryRun?: boolean;
        git?: boolean;
        json?: boolean;
      };
      const agentTarget = parseInitAgentTarget(options.agents);
      if (agentTarget === undefined) {
        writeError(
          io,
          "init",
          "Agents must be one of: claude, codex, all, none, claude,codex.",
          "INVALID_AGENT_TARGET",
          path.resolve(workspace),
        );
        exitCode = 1;
        return;
      }

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

      const agentInstall =
        agentTarget === "none"
          ? undefined
          : await installAgentAdapters({
              workspaceRoot: result.workspaceRoot,
              adapter: agentTarget,
              dryRun: result.dryRun,
            });
      const ok = result.lint.ok && (agentInstall?.conflicts.length ?? 0) === 0;
      const plannedFiles = uniqueStrings(
        result.dryRun ? [...result.files, ...(agentInstall?.plannedFiles ?? [])] : [],
      );
      const files = uniqueStrings(
        result.dryRun
          ? result.files
          : [
              ...result.files,
              ...(agentInstall?.writtenFiles ?? []),
              ...(agentInstall?.replacedFiles ?? []),
            ],
      );
      const envelope: JsonEnvelope = {
        ok,
        command: "init",
        workspace: result.workspaceRoot,
        data: {
          name: result.name,
          dryRun: result.dryRun,
          git: result.git,
          agents: renderInitAgentData(agentTarget, agentInstall),
          files,
          plannedFiles,
          directories: result.directories,
          lint: result.lint,
        },
        warnings: filterPhase2AgentPackWarnings(result.warnings),
        next: [
          "Use the generated OKF Harness skills from Claude Code or Codex.",
          "Run okfh lint --json after editing wiki files.",
        ],
      };

      writeResult(io, envelope, options.json);
      exitCode = ok ? 0 : 1;
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
        warnings: filterPhase2AgentPackWarnings(result.warnings),
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

  program
    .command("agent <action> <adapter>")
    .description("Install or repair Claude Code and Codex adapter files.")
    .storeOptionsAsProperties(false)
    .requiredOption("--workspace <path>", "workspace path")
    .option("--dry-run", "return the planned writes without creating files")
    .option("--force", "replace conflicting same-name adapter files")
    .option("--json", "write machine-readable JSON")
    .action(async (actionInput: string, adapterInput: string, command: Command) => {
      const options = command.opts() as {
        workspace: string;
        dryRun?: boolean;
        force?: boolean;
        json?: boolean;
      };
      if (actionInput !== "install") {
        writeError(
          io,
          "agent",
          "Agent action must be: install.",
          "INVALID_AGENT_ACTION",
          path.resolve(options.workspace),
        );
        exitCode = 1;
        return;
      }

      const adapter = parseAgentInstallTarget(adapterInput);
      if (adapter === undefined) {
        writeError(
          io,
          "agent install",
          "Adapter must be one of: claude, codex, all.",
          "INVALID_AGENT_ADAPTER",
          path.resolve(options.workspace),
        );
        exitCode = 1;
        return;
      }

      const workspaceStatus = await readWorkspaceStatus(options.workspace);
      if (!workspaceStatus.initialized) {
        writeError(
          io,
          "agent install",
          "Workspace is not initialized. Run okfh init first.",
          "WORKSPACE_NOT_INITIALIZED",
          workspaceStatus.workspaceRoot,
        );
        exitCode = 1;
        return;
      }

      const result = await installAgentAdapters({
        workspaceRoot: workspaceStatus.workspaceRoot,
        adapter,
        dryRun: options.dryRun === true,
        force: options.force === true,
      });
      const ok = result.conflicts.length === 0;
      const envelope: JsonEnvelope = {
        ok,
        command: "agent install",
        workspace: workspaceStatus.workspaceRoot,
        data: result,
        warnings: [],
        next: ok
          ? ["Run okfh status --workspace <path> --json to verify the workspace."]
          : ["Resolve conflicts or rerun with --force after reviewing the files."],
      };

      writeResult(io, envelope, options.json);
      exitCode = ok ? 0 : 1;
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

function parseAgentInstallTarget(input: string): AgentInstallTarget | undefined {
  if (input === "claude" || input === "codex" || input === "all") {
    return input;
  }
  return undefined;
}

type InitAgentTarget = AgentInstallTarget | "none";

function parseInitAgentTarget(input: string): InitAgentTarget | undefined {
  if (input === "none") {
    return "none";
  }
  if (input === "claude,codex" || input === "codex,claude") {
    return "all";
  }
  return parseAgentInstallTarget(input);
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

function filterPhase2AgentPackWarnings(
  warnings: Array<{ code: string; message: string }>,
): Array<{ code: string; message: string }> {
  return warnings.filter((warning) => warning.code !== "AGENT_PACK_PENDING");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
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
