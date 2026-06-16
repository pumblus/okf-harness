import { execFile } from "node:child_process";
import path from "node:path";
import {
  type AgentInstallTarget,
  type InstallAgentAdaptersResult,
  installAgentAdapters,
} from "@okf-harness/agent-pack";
import {
  addSource,
  buildWorkspaceGraph,
  createIngestPlan,
  GraphWorkspaceError,
  type InitWorkspaceResult,
  initWorkspace,
  lintWorkspace,
  listSources,
  ReadWorkspaceError,
  readWorkspaceDocument,
  readWorkspaceStatus,
  resolveWorkspaceRoot,
  SourceManagementError,
  searchWorkspace,
  WorkspaceInitError,
  WorkspaceResolutionError,
} from "@okf-harness/core";
import { Command } from "commander";

export const packageInfo = {
  name: "@okf-harness/cli",
  role: "cli",
  phase: 5,
} as const;

export type PackageInfo = typeof packageInfo;

export type CliIo = {
  writeOut: (chunk: string) => void;
  writeErr: (chunk: string) => void;
};

export type JsonEnvelope = {
  ok: boolean;
  command: string;
  workspace?: string | null;
  data: unknown;
  warnings: Array<{ code: string; message: string }>;
  next: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
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
          "Run okfh lint --workspace <path> --json after editing wiki files.",
        ],
      };

      writeResult(io, envelope, options.json);
      exitCode = ok ? 0 : 1;
    });

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
          capabilities: {
            search: "available",
            read: "available",
            graph: "available",
            queryCommand: "not_available",
          },
        },
        warnings: filterPhase2AgentPackWarnings(result.warnings),
        next: result.initialized
          ? ["Use okfh search and okfh read to answer from the synthesized wiki."]
          : [],
      };

      writeResult(io, envelope, options.json);
      exitCode = envelope.ok ? 0 : 1;
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
      const lint = await lintWorkspace(workspaceRoot);
      const envelope: JsonEnvelope = {
        ok: lint.ok,
        command: "lint",
        workspace: workspaceRoot,
        data: lint,
        warnings: [],
        next: lint.ok ? [] : ["Fix lint errors and rerun okfh lint --workspace <path> --json."],
      };

      writeResult(io, envelope, options.json);
      exitCode = lint.ok ? 0 : 1;
    });

  program
    .command("search <query>")
    .description("Search synthesized OKF wiki concept documents.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--limit <number>", "maximum results to return", parseIntegerOption)
    .option("--json", "write machine-readable JSON")
    .action(async (query: string, command: Command) => {
      const options = command.opts() as { workspace?: string; limit?: number; json?: boolean };
      let workspaceRoot: string | null = null;
      try {
        workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
        const result = await searchWorkspace({
          workspaceRoot,
          query,
          limit: options.limit,
        });
        const { workspaceRoot: _workspaceRoot, warnings, ...data } = result;
        const envelope: JsonEnvelope = {
          ok: true,
          command: "search",
          workspace: result.workspaceRoot,
          data,
          warnings,
          next:
            result.totalMatches === 0
              ? [
                  "Run okfh read index --json to inspect the wiki map.",
                  "Try broader keywords, or ingest sources first if the material is only registered raw source.",
                ]
              : ["Run okfh read <concept-id> --json for the most relevant candidate."],
        };
        writeResult(io, envelope, options.json);
        exitCode = 0;
      } catch (error) {
        const handled = writePhase5Error(io, {
          command: "search",
          error,
          workspace: workspaceRoot,
          next: ["Check the workspace path and rerun okfh search --json."],
          json: options.json === true,
        });
        if (handled) {
          exitCode = 1;
          return;
        }
        throw error;
      }
    });

  program
    .command("read <target>")
    .description("Read a bounded OKF wiki document.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--section <heading>", "read a section by heading")
    .option("--section-id <id>", "read a section by stable section id")
    .option("--offset <number>", "read from a character offset", parseIntegerOption)
    .option("--limit <number>", "maximum characters for range reads", parseIntegerOption)
    .option("--full", "explicitly request a full bounded read")
    .option("--json", "write machine-readable JSON")
    .action(async (target: string, command: Command) => {
      const options = command.opts() as {
        workspace?: string;
        section?: string;
        sectionId?: string;
        offset?: number;
        limit?: number;
        full?: boolean;
        json?: boolean;
      };
      let workspaceRoot: string | null = null;
      try {
        workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
        const result = await readWorkspaceDocument({
          workspaceRoot,
          target,
          section: options.section,
          sectionId: options.sectionId,
          offset: options.offset,
          limit: options.limit,
          full: options.full === true,
        });
        const { workspaceRoot: _workspaceRoot, warnings, ...data } = result;
        const envelope: JsonEnvelope = {
          ok: true,
          command: "read",
          workspace: result.workspaceRoot,
          data,
          warnings,
          next: result.content.truncated
            ? ["Use --section, --section-id, --offset/--limit, or --full to continue reading."]
            : [],
        };
        writeResult(io, envelope, options.json);
        exitCode = 0;
      } catch (error) {
        const handled = writePhase5Error(io, {
          command: "read",
          error,
          workspace: workspaceRoot,
          next: ["Run okfh search with broader keywords, then read one returned concept path."],
          json: options.json === true,
        });
        if (handled) {
          exitCode = 1;
          return;
        }
        throw error;
      }
    });

  program
    .command("graph")
    .description("Generate OKF backlinks data and a self-contained graph report.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--open", "open the generated graph report in the default macOS browser")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace?: string; open?: boolean; json?: boolean };
      let workspaceRoot: string | null = null;
      try {
        workspaceRoot = await resolveWorkspaceRoot({ workspaceRoot: options.workspace });
        const result = await buildWorkspaceGraph({ workspaceRoot });
        if (options.open === true) {
          await openGraphReport(result.report.htmlPath);
        }
        const { workspaceRoot: _workspaceRoot, ...data } = result;
        const envelope: JsonEnvelope = {
          ok: true,
          command: "graph",
          workspace: result.workspaceRoot,
          data,
          warnings: [],
          next: options.open === true ? [] : ["Open the graph HTML report in a browser if needed."],
        };
        writeResult(io, envelope, options.json);
        exitCode = 0;
      } catch (error) {
        const handled = writePhase5Error(io, {
          command: "graph",
          error,
          workspace: workspaceRoot,
          next: ["Check write permissions under .okfh and rerun okfh graph --json."],
          json: options.json === true,
        });
        if (handled) {
          exitCode = 1;
          return;
        }
        throw error;
      }
    });

  program
    .command("source <action> [input]")
    .description("Register and list OKF Harness raw sources.")
    .storeOptionsAsProperties(false)
    .requiredOption("--workspace <path>", "workspace path")
    .option("--dry-run", "return the planned source registration without writing files")
    .option("--json", "write machine-readable JSON")
    .action(async (actionInput: string, input: string | undefined, command: Command) => {
      const options = command.opts() as { workspace: string; dryRun?: boolean; json?: boolean };
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
          exitCode = 0;
        } catch (error) {
          if (error instanceof SourceManagementError) {
            writeError(
              io,
              "source list",
              error.message,
              error.code,
              path.resolve(options.workspace),
            );
            exitCode = 1;
            return;
          }
          throw error;
        }
        return;
      }

      if (actionInput !== "add") {
        writeError(
          io,
          "source",
          "Source action must be one of: add, list.",
          "INVALID_SOURCE_ACTION",
          path.resolve(options.workspace),
        );
        exitCode = 1;
        return;
      }
      if (input === undefined) {
        writeError(
          io,
          "source add",
          "source add requires a file path or URL.",
          "SOURCE_INPUT_REQUIRED",
          path.resolve(options.workspace),
        );
        exitCode = 2;
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
        exitCode = 0;
      } catch (error) {
        if (error instanceof SourceManagementError) {
          writeError(io, "source add", error.message, error.code, path.resolve(options.workspace));
          exitCode = error.code === "SOURCE_INPUT_UNSUPPORTED" ? 1 : 5;
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
        writeError(
          io,
          "ingest",
          "Ingest action must be: plan.",
          "INVALID_INGEST_ACTION",
          path.resolve(options.workspace),
        );
        exitCode = 1;
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
            checklist: result.checklist,
          },
          warnings: [],
          next: ["Use the ingest plan as the Agent checklist before editing wiki files."],
        };

        writeResult(io, envelope, options.json);
        exitCode = 0;
      } catch (error) {
        if (error instanceof SourceManagementError) {
          writeError(io, "ingest plan", error.message, error.code, path.resolve(options.workspace));
          exitCode = error.code === "SOURCE_NOT_REGISTERED" ? 1 : 5;
          return;
        }
        throw error;
      }
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

  io.writeOut(renderHumanResult(envelope));
}

function renderHumanResult(envelope: JsonEnvelope): string {
  if (!envelope.ok) {
    return `FAILED ${envelope.command}\n`;
  }

  if (envelope.command === "search") {
    const data = envelope.data as {
      results?: Array<{ title?: string; path?: string; type?: string; score?: number }>;
      totalMatches?: number;
      truncated?: boolean;
    };
    const rows = (data.results ?? []).map((result, index) => {
      const title = result.title ?? "(untitled)";
      const pathValue = result.path ?? "(unknown path)";
      const type = result.type ?? "Unknown";
      const score = result.score === undefined ? "" : ` score=${result.score}`;
      return `${index + 1}. ${title} [${type}] ${pathValue}${score}`;
    });
    const summary = `Found ${data.totalMatches ?? rows.length}${data.truncated ? " (truncated)" : ""}`;
    return `${summary}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
  }

  if (envelope.command === "read") {
    const data = envelope.data as {
      metadata?: { title?: string; type?: string };
      target?: { path?: string };
      content?: { text?: string; truncated?: boolean };
    };
    const title = data.metadata?.title ?? "(untitled)";
    const type = data.metadata?.type ?? "Unknown";
    const pathValue = data.target?.path ?? "(unknown path)";
    const truncated = data.content?.truncated ? " truncated" : "";
    return `${title} [${type}] ${pathValue}${truncated}\n\n${data.content?.text ?? ""}\n`;
  }

  if (envelope.command === "graph") {
    const data = envelope.data as {
      report?: { htmlPath?: string; backlinksPath?: string };
    };
    return `Graph report: ${data.report?.htmlPath ?? "(not written)"}\nBacklinks: ${data.report?.backlinksPath ?? "(not written)"}\n`;
  }

  return `${envelope.ok ? "OK" : "FAILED"} ${envelope.command}\n`;
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

  if (error instanceof WorkspaceResolutionError) {
    if (options.json) {
      writePhase5Error(io, {
        command: options.command,
        error,
        workspace: null,
        next: ["Run from inside an OKF Harness workspace or pass --workspace <path>."],
        json: true,
      });
    } else {
      io.writeErr(`${error.message}\n`);
    }
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

function writePhase5Error(
  io: CliIo,
  options: {
    command: string;
    error: unknown;
    workspace: string | null;
    next: string[];
    json?: boolean | undefined;
  },
): boolean {
  const normalized = normalizePhase5Error(options.error);
  if (normalized === undefined) {
    return false;
  }

  const envelope: JsonEnvelope = {
    ok: false,
    command: options.command,
    workspace: options.workspace,
    data: {},
    warnings: [],
    error: normalized,
    next: options.next,
  };
  if (options.json === true) {
    io.writeErr(`${JSON.stringify(envelope)}\n`);
  } else {
    io.writeErr(renderHumanError(normalized.message, options.next));
  }
  return true;
}

function renderHumanError(message: string, next: string[]): string {
  const nextStep = next[0];
  return nextStep === undefined ? `${message}\n` : `${message}\nNext: ${nextStep}\n`;
}

function normalizePhase5Error(error: unknown):
  | {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
  | undefined {
  if (error instanceof WorkspaceResolutionError) {
    return {
      code: error.code,
      message: error.message,
      details: { startDir: error.startDir },
    };
  }
  if (error instanceof ReadWorkspaceError) {
    const normalized = {
      code: error.code,
      message: error.message,
    };
    return Object.keys(error.details).length > 0
      ? { ...normalized, details: error.details }
      : normalized;
  }
  if (error instanceof GraphWorkspaceError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  if (isErrorWithCode(error)) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  return undefined;
}

function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected an integer option value, received: ${value}`);
  }
  return parsed;
}

async function openGraphReport(htmlPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile("open", [htmlPath], (error) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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

function isErrorWithCode(error: unknown): error is { code: string; message: string } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}
