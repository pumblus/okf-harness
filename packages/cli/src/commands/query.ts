import {
  buildWorkspaceGraph,
  type EvidenceBriefResult,
  type EvidenceBudgetPreset,
  planEvidenceBrief,
  readWorkspaceDocument,
  searchWorkspace,
} from "@okf-harness/core";
import type { Command } from "commander";
import { defineCommand } from "../define-command.js";
import { GraphOpenError, openGraphReport } from "../graph-open.js";
import { parseIntegerOption } from "../options/index.js";
import type { CliIo, JsonEnvelope } from "../types.js";

export function registerQueryCommands(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
): void {
  defineCommand(program, io, setExitCode, {
    command: "search <query>",
    description: "Search synthesized OKF wiki concept documents.",
    options: [
      {
        flags: "--limit <number>",
        description: "maximum results to return",
        parse: parseIntegerOption,
      },
    ],
    run: async (args, options, workspaceRoot) => {
      const result = await searchWorkspace({
        workspaceRoot,
        query: args[0] as string,
        limit: options.limit as number | undefined,
      });
      const { workspaceRoot: _workspaceRoot, warnings, ...data } = result;
      return {
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
    },
    human: humanSearch,
  });

  defineCommand(program, io, setExitCode, {
    command: "evidence <question>",
    description: "Prepare a bounded OKF evidence brief.",
    options: [
      {
        flags: "--budget <preset>",
        description:
          "character budget preset: compact (~256k), standard (~400k), large (~1M); guidance, not token estimation",
        parse: parseEvidenceBudgetOption,
      },
      {
        flags: "--max-chars <number>",
        description: "override the evidence text character budget",
        parse: parseIntegerOption,
      },
    ],
    run: async (args, options, workspaceRoot) => {
      const result = await planEvidenceBrief({
        workspaceRoot,
        question: args[0] as string,
        budget: options.budget as EvidenceBudgetPreset | undefined,
        maxChars: options.maxChars as number | undefined,
      });
      const { workspaceRoot: _workspaceRoot, warnings, ...data } = result;
      return {
        data,
        warnings,
        next: result.limits.some((limit) => limit.code === "NO_MATCHES")
          ? ["Try broader keywords only if the user asks to broaden the evidence search."]
          : result.evidence.length === 0 &&
              result.candidates.length === 0 &&
              result.seals.length > 0
            ? []
            : ["Run okfh read <concept-id> --json only for a bounded follow-up."],
      };
    },
    human: humanEvidence,
  });

  defineCommand(program, io, setExitCode, {
    command: "read <target>",
    description: "Read a bounded OKF wiki document.",
    options: [
      { flags: "--section <heading>", description: "read a section by heading" },
      { flags: "--section-id <id>", description: "read a section by stable section id" },
      {
        flags: "--offset <number>",
        description: "read from a character offset",
        parse: parseIntegerOption,
      },
      {
        flags: "--limit <number>",
        description: "maximum characters for range reads",
        parse: parseIntegerOption,
      },
      { flags: "--full", description: "explicitly request a full bounded read" },
    ],
    run: async (args, options, workspaceRoot) => {
      const result = await readWorkspaceDocument({
        workspaceRoot,
        target: args[0] as string,
        section: options.section as string | undefined,
        sectionId: options.sectionId as string | undefined,
        offset: options.offset as number | undefined,
        limit: options.limit as number | undefined,
        full: options.full === true,
      });
      const { workspaceRoot: _workspaceRoot, warnings, ...data } = result;
      return {
        data,
        warnings,
        next: result.content.truncated
          ? ["Use --section, --section-id, --offset/--limit, or --full to continue reading."]
          : [],
      };
    },
    errorNext: ["Run okfh search with broader keywords, then read one returned concept path."],
    human: humanRead,
  });

  defineCommand(program, io, setExitCode, {
    command: "graph",
    description: "Generate OKF backlinks data and a self-contained graph report.",
    options: [
      {
        flags: "--open",
        description: "open the generated graph report in the system default browser",
      },
    ],
    run: async (_args, options, workspaceRoot) => {
      const result = await buildWorkspaceGraph({ workspaceRoot });
      if (options.open === true) {
        await openGraphReport(result.report.htmlPath);
      }
      const { workspaceRoot: _workspaceRoot, ...data } = result;
      return {
        data,
        warnings: [],
        next: options.open === true ? [] : ["Open the graph HTML report in a browser if needed."],
      };
    },
    errorNext: (error) =>
      error instanceof GraphOpenError
        ? [
            "Open the generated graph HTML report manually, or rerun okfh graph --json without --open.",
          ]
        : ["Check write permissions under .okfh and rerun okfh graph --json."],
    human: humanGraph,
  });
}

function parseEvidenceBudgetOption(value: string): EvidenceBudgetPreset {
  if (value === "compact" || value === "standard" || value === "large") {
    return value;
  }
  throw new Error(`Expected compact, standard, or large evidence budget, received: ${value}`);
}

function humanSearch(envelope: JsonEnvelope): string {
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

function humanEvidence(envelope: JsonEnvelope): string {
  const data = envelope.data as Partial<EvidenceBriefResult>;
  const rows = [
    `Evidence: ${data.evidence?.length ?? 0}`,
    `Candidates: ${data.candidates?.length ?? 0}`,
  ];
  for (const seal of data.seals ?? []) {
    const anchor = [seal.sourceId, seal.sourcePath].filter(Boolean).join(" ");
    rows.push(`Seal ${seal.code}${anchor.length > 0 ? `: ${anchor}` : ""}`);
    rows.push(`- Sealed: ${seal.sealed.join(", ") || "(none)"}`);
    rows.push(`- Basis: ${seal.basis}`);
  }
  return `${rows.join("\n")}\n`;
}

function humanRead(envelope: JsonEnvelope): string {
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

function humanGraph(envelope: JsonEnvelope): string {
  const data = envelope.data as {
    report?: { htmlPath?: string; backlinksPath?: string };
  };
  return `Graph report: ${data.report?.htmlPath ?? "(not written)"}\nBacklinks: ${data.report?.backlinksPath ?? "(not written)"}\n`;
}
