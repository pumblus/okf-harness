import { execFile } from "node:child_process";
import path from "node:path";
import { type InstallAgentAdaptersResult, installAgentAdapters } from "@okf-harness/agent-pack";
import {
  addSource,
  buildWorkspaceGraph,
  createIngestPlan,
  type InitWorkspaceResult,
  initWorkspace,
  lintWorkspace,
  listSources,
  readWorkspaceDocument,
  readWorkspaceStatus,
  resolveWorkspaceRoot,
  SourceManagementError,
  searchWorkspace,
  WorkspaceInitError,
} from "@okf-harness/core";
import { Command } from "commander";
import { runDoctor } from "./doctor/index.js";
import { handleCliError, writeCliError, writeValidationError } from "./errors/index.js";
import {
  commandFromArgv,
  type InitAgentTarget,
  parseAgentInstallTarget,
  parseInitAgentTarget,
  parseIntegerOption,
} from "./options/index.js";
import { writeResult } from "./render/result.js";
import type { CliIo, JsonEnvelope } from "./types.js";

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
        writeValidationError(io, {
          command: "init",
          code: "INVALID_AGENT_TARGET",
          message: "Agents must be one of: claude, codex, all, none, claude,codex.",
          workspace: path.resolve(workspace),
          next: ["Rerun okfh init with --agents all, claude, codex, none, or claude,codex."],
          json: options.json === true,
        });
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
          writeCliError(io, {
            command: "init",
            error,
            workspace: path.resolve(workspace),
            next:
              error.code === "INIT_NOT_EMPTY"
                ? ["Choose an empty directory, or run okfh doctor --workspace <path> --json."]
                : ["Fix the initialization input and rerun okfh init --json."],
            json: options.json === true,
          });
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
        warnings: filterAgentPackPendingWarnings(result.warnings),
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
        warnings: filterAgentPackPendingWarnings(result.warnings),
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
        const handled = writeCliError(io, {
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
        const handled = writeCliError(io, {
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
        const handled = writeCliError(io, {
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
    .command("doctor")
    .description("Check okfh, local shell dependencies, and workspace readiness.")
    .storeOptionsAsProperties(false)
    .option("--workspace <path>", "workspace path")
    .option("--json", "write machine-readable JSON")
    .action(async (command: Command) => {
      const options = command.opts() as { workspace?: string; json?: boolean };
      const result = await runDoctor({ workspaceRoot: options.workspace });
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
      exitCode = result.ok ? 0 : 1;
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
            writeCliError(io, {
              command: "source list",
              error,
              workspace: path.resolve(options.workspace),
              next: ["Check the workspace path and rerun okfh source list --json."],
              json: options.json === true,
            });
            exitCode = 1;
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
          message: "Source action must be one of: add, list.",
          workspace: path.resolve(options.workspace),
          next: ["Use okfh source add <path-or-url> --workspace <path> --json."],
          json: options.json === true,
        });
        exitCode = 1;
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
          writeCliError(io, {
            command: "source add",
            error,
            workspace: path.resolve(options.workspace),
            next: ["Check the source input and workspace path, then rerun okfh source add --json."],
            json: options.json === true,
          });
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
        writeValidationError(io, {
          command: "ingest",
          code: "INVALID_INGEST_ACTION",
          message: "Ingest action must be: plan.",
          workspace: path.resolve(options.workspace),
          next: ["Use okfh ingest plan <source-id-or-path> --workspace <path> --json."],
          json: options.json === true,
        });
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
          writeCliError(io, {
            command: "ingest plan",
            error,
            workspace: path.resolve(options.workspace),
            next: ["Register the source first with okfh source add, then rerun okfh ingest plan."],
            json: options.json === true,
          });
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
        writeValidationError(io, {
          command: "agent",
          code: "INVALID_AGENT_ACTION",
          message: "Agent action must be: install.",
          workspace: path.resolve(options.workspace),
          next: ["Use okfh agent install claude|codex|all --workspace <path> --json."],
          json: options.json === true,
        });
        exitCode = 1;
        return;
      }

      const adapter = parseAgentInstallTarget(adapterInput);
      if (adapter === undefined) {
        writeValidationError(io, {
          command: "agent install",
          code: "INVALID_AGENT_ADAPTER",
          message: "Adapter must be one of: claude, codex, all.",
          workspace: path.resolve(options.workspace),
          next: ["Rerun with adapter claude, codex, or all."],
          json: options.json === true,
        });
        exitCode = 1;
        return;
      }

      const workspaceStatus = await readWorkspaceStatus(options.workspace);
      if (!workspaceStatus.initialized) {
        writeValidationError(io, {
          command: "agent install",
          code: "WORKSPACE_NOT_INITIALIZED",
          message: "Workspace is not initialized. Run okfh init first.",
          workspace: workspaceStatus.workspaceRoot,
          next: ["Run okfh init <workspace> --name <name> --agents all --json first."],
          json: options.json === true,
        });
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

function renderInitAgentData(
  requested: InitAgentTarget,
  install: InstallAgentAdaptersResult | undefined,
): { requested: InitAgentTarget; install?: InstallAgentAdaptersResult } {
  if (install === undefined) {
    return { requested };
  }
  return { requested, install };
}

function filterAgentPackPendingWarnings(
  warnings: Array<{ code: string; message: string }>,
): Array<{ code: string; message: string }> {
  return warnings.filter((warning) => warning.code !== "AGENT_PACK_PENDING");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
