import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const packageInfo = {
  name: "@okf-harness/agent-pack",
  role: "agent-pack",
  phase: 3,
} as const;

export type PackageInfo = typeof packageInfo;

export type AgentAdapter = "claude" | "codex";
export type AgentInstallTarget = AgentAdapter | "all";

export type RenderedAgentFile = {
  path: string;
  contents: string;
};

export type RenderAgentAdapterOptions = {
  adapter: AgentAdapter;
  version?: string;
};

export type RenderedAgentAdapter = {
  adapter: AgentAdapter;
  files: RenderedAgentFile[];
};

export type ManagedBlockAction = "created" | "inserted" | "replaced" | "unchanged";

export type ManagedBlockResult = {
  path: string;
  action: ManagedBlockAction;
};

export type AgentInstallConflict = {
  path: string;
  reason: string;
};

export type InstallAgentAdaptersOptions = {
  workspaceRoot: string;
  adapter: AgentInstallTarget;
  dryRun?: boolean;
  force?: boolean;
};

export type InstallAgentAdaptersResult = {
  adapter: AgentInstallTarget;
  dryRun: boolean;
  writtenFiles: string[];
  plannedFiles: string[];
  replacedFiles: string[];
  skippedFiles: string[];
  conflicts: AgentInstallConflict[];
  managedBlocks: ManagedBlockResult[];
};

type SkillTemplate = {
  name: string;
  title: string;
  description: string;
  summary: string;
  requiredBehavior: string[];
  hardRules: string[];
  reference: {
    path: string;
    title: string;
    body: string;
  };
};

const defaultVersion = "0.1";
const managedBlockStart = "<!-- OKF Harness: start -->";
const managedBlockEnd = "<!-- OKF Harness: end -->";

const skillTemplates: SkillTemplate[] = [
  {
    name: "okf-harness-init",
    title: "OKF Harness Init",
    description:
      "Initialize and organize an OKF Harness workspace on macOS, including folders, git, OKF bundle files, and Claude/Codex adapters. Use when the user asks to set up, create, initialize, organize, or install OKF Harness support. Do not use for ingesting an already-added source.",
    summary: "Use this skill to create a workspace or repair Claude/Codex adapter support.",
    requiredBehavior: [
      "Locate or choose the workspace path with the user.",
      "Use the local shell to run `okfh init <workspace> --name <name> --agents all --json` for first-time setup.",
      "Use `okfh agent install all --workspace <workspace> --json` to repair adapter files in an existing workspace.",
      "If the CLI is unavailable, stop and tell the user to install OKF Harness instead of hand-writing the workspace structure.",
      "After initialization, run `okfh status --workspace <workspace> --json` and report the workspace path, lint status, warnings, and next step.",
    ],
    hardRules: [
      "Do not create a parallel workspace skeleton by hand.",
      "Do not overwrite a non-empty directory unless `okfh` returns an explicit safe plan.",
      "Do not add MCP, plugin, hook, Pi, OpenCode, or Obsidian setup.",
      "Run `git diff` before final response when file changes were made.",
    ],
    reference: {
      path: "workflow.md",
      title: "Init Workflow",
      body: `# Init Workflow

## First-time setup

Run:

\`\`\`bash
okfh init <workspace> --name <name> --agents all --json
\`\`\`

Use \`--agents claude\`, \`--agents codex\`, or \`--agents none\` only when the user explicitly asks for that narrower target.

## Repair adapter support

Run:

\`\`\`bash
okfh agent install all --workspace <workspace> --json
\`\`\`

If the command returns conflicts, explain the conflicting paths and ask before using \`--force\`.
`,
    },
  },
  {
    name: "okf-harness-ingest",
    title: "OKF Harness Ingest",
    description:
      "Add source material and compile it into an OKF-compatible LLM Wiki by creating reference pages, updating topic/entity/project pages, citations, index, and log. Use when the user asks to add, ingest, absorb, summarize into the wiki, or organize a new source. Do not use for general question answering without new sources.",
    summary: "Use this skill to register source material and compile it into the local OKF wiki.",
    requiredBehavior: [
      "Locate the workspace by finding `okfh.config.yaml`.",
      "Use the local shell to run `okfh --json` commands.",
      "If the source is not registered, run `okfh source add <path-or-url> --workspace <workspace> --json`.",
      "Run `okfh ingest plan <source-id-or-path> --workspace <workspace> --json` before editing wiki files.",
      "Treat candidate concepts as metadata hints only; read the full source before semantic analysis.",
      "After ingest work changes wiki files, run `okfh lint --workspace <workspace> --json`.",
      "Show the user changed files, lint status, and unresolved questions.",
    ],
    hardRules: [
      "Never edit `raw/sources/`.",
      "Never invent source IDs, citations, dates, or claims.",
      "Do not hand-roll a source manifest, search index, graph, or raw source management.",
      "If more than 20 wiki files seem affected, stop after an ingest plan and ask the user to narrow scope.",
      "Run `git diff` before final response when file changes were made.",
    ],
    reference: {
      path: "ingest-contract.md",
      title: "Ingest Contract",
      body: `# Ingest Contract

## Supported now

Run:

\`\`\`bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
\`\`\`

The ingest plan is metadata-level guidance. It returns a recommended reference path, candidate concepts, and an Agent checklist; it does not read source bodies, summarize content, extract claims, or synthesize wiki pages.

## Wiki update contract

- Create or update one \`wiki/references/<slug>.md\` page per source.
- Update only affected \`wiki/topics/\`, \`wiki/entities/\`, \`wiki/projects/\`, \`wiki/decisions/\`, or \`wiki/questions/\` pages.
- Preserve uncertainty and contradictions.
- Add or update \`# Citations\` sections.
- Update \`wiki/index.md\` and relevant subdirectory indexes.
- Append \`wiki/log.md\`.
`,
    },
  },
  {
    name: "okf-harness-query",
    title: "OKF Harness Query",
    description:
      "Answer questions using the local OKF Harness wiki by searching concepts, reading full pages, following citations, and citing concept paths. Use when the user asks what their knowledge base says, asks a research question, or requests synthesis from existing wiki knowledge. Do not use to ingest new source material.",
    summary: "Use this skill to answer from existing OKF wiki knowledge.",
    requiredBehavior: [
      "Locate the workspace by finding `okfh.config.yaml`.",
      "Prefer `okfh search <query> --json` and `okfh read <concept-id> --json` when those commands exist.",
      "If search/read commands are unavailable, stop and report that query support is not implemented in this OKF Harness phase.",
      "Read full relevant wiki pages before synthesizing.",
      "Cite wiki paths or concept IDs in the answer.",
      "Keep uncertainty and contradictions visible.",
    ],
    hardRules: [
      "Do not ingest new source material from this skill.",
      "Do not invent citations or claim the wiki says something without reading it.",
      "Do not build an ad hoc search index when the CLI command is unavailable.",
      "Do not edit `raw/sources/`.",
    ],
    reference: {
      path: "answer-contract.md",
      title: "Answer Contract",
      body: `# Answer Contract

## Phase boundary

Search and read are Phase 5 capabilities. If \`okfh search\` or \`okfh read\` is unavailable, stop and say the installed OKF Harness version does not implement query support yet.

## Answer shape

When query commands are available, answer with:

- Direct answer.
- Evidence from wiki paths or concept IDs.
- Open questions or contradictions.
- Suggested follow-up only when it naturally follows from the wiki evidence.
`,
    },
  },
  {
    name: "okf-harness-maintain",
    title: "OKF Harness Maintain",
    description:
      "Maintain an OKF Harness wiki by running lint, repairing broken links or missing metadata, updating index/log files, checking source hashes, and generating graph reports. Use when the user asks to check, clean up, repair, validate, lint, or visualize the knowledge base. Do not use for first-time initialization.",
    summary: "Use this skill to lint and repair an existing OKF Harness workspace.",
    requiredBehavior: [
      "Locate the workspace by finding `okfh.config.yaml`.",
      "Run `okfh lint --workspace <workspace> --json` before deciding what to change.",
      "Use small patches for wiki repairs.",
      "Run `okfh lint --workspace <workspace> --json` again after wiki edits.",
      "Use `okfh graph --json` only when that command exists.",
      "If graph support is unavailable, stop and report that graph generation is not implemented in this OKF Harness phase.",
      "Report lint status, changed files, and any remaining manual fixes.",
    ],
    hardRules: [
      "Never edit `raw/sources/`.",
      "Do not silently rewrite large wiki sections.",
      "Do not hand-roll graph reports or source hash checks when CLI commands are unavailable.",
      "Run `git diff` before final response when file changes were made.",
    ],
    reference: {
      path: "lint-contract.md",
      title: "Lint Contract",
      body: `# Lint Contract

## Supported now

Run:

\`\`\`bash
okfh lint --workspace <workspace> --json
\`\`\`

Fix only issues that can be resolved from current wiki context without inventing missing source facts.

## Future maintenance commands

Source hash checks are supported by \`okfh lint\`. Graph generation is a later-phase capability; if \`okfh graph\` is unavailable, stop and say the installed OKF Harness version does not implement graph generation yet.
`,
    },
  },
];

export function renderAgentAdapter(options: RenderAgentAdapterOptions): RenderedAgentAdapter {
  const version = options.version ?? defaultVersion;
  return {
    adapter: options.adapter,
    files: [renderRootGuidance(options.adapter), ...renderSkillFiles(options.adapter, version)],
  };
}

export async function installAgentAdapters(
  options: InstallAgentAdaptersOptions,
): Promise<InstallAgentAdaptersResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const plan = createInstallResult(options.adapter, dryRun);

  await planAgentAdapterWrites(workspaceRoot, options.adapter, {
    dryRun: true,
    force,
    result: plan,
  });

  if (dryRun || plan.conflicts.length > 0) {
    return plan;
  }

  const result = createInstallResult(options.adapter, false);
  await planAgentAdapterWrites(workspaceRoot, options.adapter, { dryRun: false, force, result });

  return result;
}

function createInstallResult(
  adapter: AgentInstallTarget,
  dryRun: boolean,
): InstallAgentAdaptersResult {
  return {
    adapter,
    dryRun,
    writtenFiles: [],
    plannedFiles: [],
    replacedFiles: [],
    skippedFiles: [],
    conflicts: [],
    managedBlocks: [],
  };
}

async function planAgentAdapterWrites(
  workspaceRoot: string,
  adapterTarget: AgentInstallTarget,
  context: { dryRun: boolean; force: boolean; result: InstallAgentAdaptersResult },
): Promise<void> {
  for (const adapter of adaptersForTarget(adapterTarget)) {
    for (const file of renderAgentAdapter({ adapter }).files) {
      if (isRootGuidancePath(file.path)) {
        await planRootGuidanceWrite(workspaceRoot, file, context);
      } else {
        await planManagedFileWrite(workspaceRoot, file, context);
      }
    }
  }
}

function renderRootGuidance(adapter: AgentAdapter): RenderedAgentFile {
  const rootPath = adapter === "claude" ? "CLAUDE.md" : "AGENTS.md";
  const routePrefix = adapter === "claude" ? "/" : "$";
  const routeLabel =
    adapter === "claude"
      ? "Use the project skills for user-facing workflows:"
      : "Use repo skills for workflows:";

  return {
    path: rootPath,
    contents: `# OKF Harness workspace

${managedBlockStart}
This repository is an OKF Harness workspace.

${routeLabel}

- \`${routePrefix}okf-harness-init\` for first-time setup and adapter repair.
- \`${routePrefix}okf-harness-ingest\` for adding or compiling sources.
- \`${routePrefix}okf-harness-query\` for answering from the wiki.
- \`${routePrefix}okf-harness-maintain\` for lint, repair, and graph reports.

Rules:

- \`raw/sources/\` is immutable. Never edit source files.
- \`wiki/\` is the OKF bundle and may be edited by the agent.
- Use \`okfh --json\` through the local shell for deterministic harness operations.
- Run \`okfh lint --workspace <workspace> --json\` after modifying wiki files.
- Run \`git diff\` before final response after any file changes.
${managedBlockEnd}
`,
  };
}

function adaptersForTarget(target: AgentInstallTarget): AgentAdapter[] {
  return target === "all" ? ["claude", "codex"] : [target];
}

function isRootGuidancePath(filePath: string): boolean {
  return filePath === "AGENTS.md" || filePath === "CLAUDE.md";
}

async function planRootGuidanceWrite(
  workspaceRoot: string,
  file: RenderedAgentFile,
  context: { dryRun: boolean; result: InstallAgentAdaptersResult },
): Promise<void> {
  const absolutePath = path.join(workspaceRoot, file.path);
  const existing = await readOptionalTextFile(absolutePath);
  const nextContents = mergeRootGuidance(existing, file.contents);
  if (nextContents.conflict !== undefined) {
    context.result.conflicts.push({
      path: file.path,
      reason: nextContents.conflict,
    });
    return;
  }

  context.result.managedBlocks.push({ path: file.path, action: nextContents.action });
  if (existing === nextContents.contents) {
    context.result.skippedFiles.push(file.path);
    return;
  }

  context.result.plannedFiles.push(file.path);
  if (context.dryRun) {
    return;
  }

  await writeRenderedFile(absolutePath, nextContents.contents);
  if (existing === undefined) {
    context.result.writtenFiles.push(file.path);
  } else {
    context.result.replacedFiles.push(file.path);
  }
}

async function planManagedFileWrite(
  workspaceRoot: string,
  file: RenderedAgentFile,
  context: { dryRun: boolean; force: boolean; result: InstallAgentAdaptersResult },
): Promise<void> {
  const absolutePath = path.join(workspaceRoot, file.path);
  const existing = await readOptionalTextFile(absolutePath);

  if (existing === file.contents) {
    context.result.skippedFiles.push(file.path);
    return;
  }

  if (
    existing !== undefined &&
    !isHarnessManagedSkill(existing) &&
    !isPhase2Placeholder(existing) &&
    !context.force
  ) {
    context.result.conflicts.push({
      path: file.path,
      reason:
        "Existing file is not marked as OKF Harness managed. Re-run with --force to replace it.",
    });
    return;
  }

  context.result.plannedFiles.push(file.path);
  if (context.dryRun) {
    return;
  }

  await writeRenderedFile(absolutePath, file.contents);
  if (existing === undefined) {
    context.result.writtenFiles.push(file.path);
  } else {
    context.result.replacedFiles.push(file.path);
  }
}

function mergeRootGuidance(
  existing: string | undefined,
  renderedRoot: string,
): { contents: string; action: ManagedBlockAction; conflict?: string } {
  const renderedBlock = extractManagedBlock(renderedRoot);
  if (existing === undefined || isPhase2Placeholder(existing)) {
    return { contents: renderedRoot, action: existing === undefined ? "created" : "replaced" };
  }

  const existingStart = existing.indexOf(managedBlockStart);
  const existingEnd = existing.indexOf(managedBlockEnd);
  if (existingStart !== -1 || existingEnd !== -1) {
    if (existingStart === -1 || existingEnd === -1 || existingEnd <= existingStart) {
      return {
        contents: existing,
        action: "unchanged",
        conflict:
          "Existing root guidance contains a malformed OKF Harness managed block. Fix the markers before reinstalling.",
      };
    }
  }
  if (existingStart !== -1 && existingEnd !== -1 && existingEnd > existingStart) {
    const afterEnd = existingEnd + managedBlockEnd.length;
    const contents = `${existing.slice(0, existingStart)}${renderedBlock}${existing.slice(afterEnd)}`;
    return {
      contents,
      action: contents === existing ? "unchanged" : "replaced",
    };
  }

  const separator = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  return { contents: `${existing}${separator}${renderedBlock}\n`, action: "inserted" };
}

function extractManagedBlock(contents: string): string {
  const start = contents.indexOf(managedBlockStart);
  const end = contents.indexOf(managedBlockEnd);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Rendered root guidance is missing the OKF Harness managed block.");
  }
  return contents.slice(start, end + managedBlockEnd.length);
}

function isHarnessManagedSkill(contents: string): boolean {
  return contents.includes("okf-harness-managed: true");
}

function isPhase2Placeholder(contents: string): boolean {
  return (
    contents.trim() === "@AGENTS.md" ||
    contents.includes("Phase 2 placeholder. Agent skills are installed in Phase 3.")
  );
}

async function readOptionalTextFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeRenderedFile(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function renderSkillFiles(adapter: AgentAdapter, version: string): RenderedAgentFile[] {
  const skillRoot = adapter === "claude" ? ".claude/skills" : ".agents/skills";
  return skillTemplates.flatMap((skill) => [
    {
      path: `${skillRoot}/${skill.name}/SKILL.md`,
      contents: renderSkill(skill, version),
    },
    {
      path: `${skillRoot}/${skill.name}/references/${skill.reference.path}`,
      contents: skill.reference.body,
    },
  ]);
}

function renderSkill(skill: SkillTemplate, version: string): string {
  return `---
name: ${skill.name}
description: ${skill.description}
license: Apache-2.0
compatibility: Designed for Claude Code and Codex on macOS. Requires the okfh CLI and local shell command access.
metadata:
  okf-harness-version: "${version}"
  okf-harness-managed: true
---

# ${skill.title}

${skill.summary}

## Required Behavior

${numberedList(skill.requiredBehavior)}

## Hard Rules

${bulletList(skill.hardRules)}

See [the ${referenceLabel(skill.reference.title)}](references/${skill.reference.path}) for details.
`;
}

function numberedList(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function referenceLabel(title: string): string {
  return title.toLowerCase();
}
