import {
  buildWorkspaceGraph,
  readWorkspaceDocument,
  resolveWorkspaceRoot,
  searchWorkspace,
} from "@okf-harness/core";
import type { Command } from "commander";
import { writeCliError } from "../errors/index.js";
import { GraphOpenError, openGraphReport } from "../graph-open.js";
import { parseIntegerOption } from "../options/index.js";
import { writeResult } from "../render/result.js";
import type { CliIo, JsonEnvelope } from "../types.js";

export function registerQueryCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
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
        setExitCode(0);
      } catch (error) {
        const handled = writeCliError(io, {
          command: "search",
          error,
          workspace: workspaceRoot,
          next: ["Check the workspace path and rerun okfh search --json."],
          json: options.json === true,
        });
        if (handled) {
          setExitCode(1);
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
        setExitCode(0);
      } catch (error) {
        const handled = writeCliError(io, {
          command: "read",
          error,
          workspace: workspaceRoot,
          next: ["Run okfh search with broader keywords, then read one returned concept path."],
          json: options.json === true,
        });
        if (handled) {
          setExitCode(1);
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
    .option("--open", "open the generated graph report in the system default browser")
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
        setExitCode(0);
      } catch (error) {
        const handled = writeCliError(io, {
          command: "graph",
          error,
          workspace: workspaceRoot,
          next:
            error instanceof GraphOpenError
              ? [
                  "Open the generated graph HTML report manually, or rerun okfh graph --json without --open.",
                ]
              : ["Check write permissions under .okfh and rerun okfh graph --json."],
          json: options.json === true,
        });
        if (handled) {
          setExitCode(1);
          return;
        }
        throw error;
      }
    });
}
