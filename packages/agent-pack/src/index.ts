import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const packageInfo = {
  name: "@okf-harness/agent-pack",
  role: "agent-pack",
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
  removedFiles: string[];
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
  references: Array<{
    path: string;
    title: string;
    body: string;
  }>;
};

const defaultVersion = "0.2";
const managedBlockStart = "<!-- OKF Harness: start -->";
const managedBlockEnd = "<!-- OKF Harness: end -->";

const skillTemplates: SkillTemplate[] = [
  {
    name: "okf-harness",
    title: "OKF Harness",
    description:
      "Route OKF Harness workspace workflows for setup, check, ingest, answer, and graph from one agent entrypoint. Use when the user asks to set up, check, ingest, answer from, maintain, or visualize an OKF Harness workspace. Do not use workflow-specific skill names or run an `okfh query` command.",
    summary:
      "Use this skill as the single OKF Harness entrypoint. Route the user's intent internally, then load only the relevant reference file.",
    requiredBehavior: [
      "Identify the user intent as setup, check, ingest, answer, or graph.",
      "Locate the workspace by finding `okfh.config.yaml` unless the user is setting up a new workspace.",
      "Use the local shell to run `okfh --json` commands for deterministic harness operations.",
      "Load only the reference file for the selected internal workflow.",
      "After wiki edits, run `okfh check --workspace <workspace> --json` and report the check status before broader cleanup advice.",
      "Report changed files and run `git diff` before final response when file changes were made.",
    ],
    hardRules: [
      "Do not expose workflow-specific skill names to users.",
      "Do not create a parallel workspace skeleton by hand.",
      "Never edit `raw/sources/`.",
      "Never invent source IDs, citations, dates, or claims.",
      "Do not run or hallucinate an `okfh query` command.",
      "Do not add plugin, hook, Pi, OpenCode, Obsidian, GUI, MCP, or vector-search setup.",
    ],
    references: [
      {
        path: "setup.md",
        title: "Setup Workflow",
        body: `# Setup Workflow

## First-time setup

For Codex, run:

\`\`\`bash
okfh init <workspace> --name <name> --agents codex --json
\`\`\`

For Claude Code, run:

\`\`\`bash
okfh init <workspace> --name <name> --agents claude --json
\`\`\`

Use \`--agents all\` only when the user explicitly asks to prepare both supported agents. Use \`--agents none\` only for advanced or developer setup.

## Repair adapter support

Repair the current agent first:

\`\`\`bash
okfh agent install codex --workspace <workspace> --json
okfh agent install claude --workspace <workspace> --json
\`\`\`

Choose the command that matches the current agent. If the command returns conflicts, explain the conflicting paths and ask before using \`--force\`.

After setup or repair, run \`okfh status --workspace <workspace> --json\` and remind the user to start a fresh Codex thread or Claude Code session.
`,
      },
      {
        path: "check.md",
        title: "Check Workflow",
        body: `# Check Workflow

Run:

\`\`\`bash
okfh check --workspace <workspace> --json
\`\`\`

Report the check status first:

- \`ready\`: OKF conformance passes and Harness lint has no findings.
- \`needs_attention\`: OKF conformance passes, but Harness lint has maintainability or evidence-integrity findings.
- \`blocked\`: OKF conformance fails and the workspace is not OKF-readable.

Keep OKF conformance separate from Harness lint. High-priority Harness lint requires risk disclosure, but it blocks only answers that directly depend on affected source or reference records.
`,
      },
      {
        path: "ingest.md",
        title: "Ingest Workflow",
        body: `# Ingest Workflow

Register source material before synthesis:

\`\`\`bash
okfh source add <path-or-url> --workspace <workspace> --json
okfh ingest plan <source-id-or-path> --workspace <workspace> --json
\`\`\`

The ingest plan is metadata-level guidance. It returns a recommended reference path, candidate concepts, and an agent checklist; it does not read source bodies, summarize content, extract claims, or synthesize wiki pages.

After wiki edits, run:

\`\`\`bash
okfh check --workspace <workspace> --json
\`\`\`

Show changed files, check status, and unresolved questions.
`,
      },
      {
        path: "answer.md",
        title: "Answer Workflow",
        body: `# Answer Workflow

Use the CLI as the deterministic retrieval layer:

\`\`\`bash
okfh status --json
okfh read index --json
okfh search "<question>" --json
okfh read <concept-id-or-path> --json
\`\`\`

There is no \`okfh query\` command in the current CLI. Do not run or hallucinate an \`okfh query\` command. Compose answers from search candidate cards plus bounded reads.

Use \`okfh check --json\` when status is missing, stale, blocked, or the answer depends on high-priority Harness lint findings. Do not run a full check before every answer when current status is already trustworthy.

Answer directly first, then list supporting concept paths and available source IDs. If hits are weak, citations are missing, or only wiki synthesis was read, state the evidence limit plainly.
`,
      },
      {
        path: "graph.md",
        title: "Graph Workflow",
        body: `# Graph Workflow

Run graph only when the user asks to visualize or generate a graph report:

\`\`\`bash
okfh graph --workspace <workspace> --json
\`\`\`

Do not hand-roll graph reports. Report the generated HTML and backlinks paths from the command output.
`,
      },
    ],
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
    removedFiles: [],
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
    await planOldWorkflowSkillCleanup(workspaceRoot, adapter, context);
    for (const file of renderAgentAdapter({ adapter }).files) {
      if (isRootGuidancePath(file.path)) {
        await planRootGuidanceWrite(workspaceRoot, file, context);
      } else {
        await planManagedFileWrite(workspaceRoot, file, context);
      }
    }
  }
}

const oldWorkflowSkillNames = [
  "okf-harness-init",
  "okf-harness-ingest",
  "okf-harness-query",
  "okf-harness-maintain",
] as const;

async function planOldWorkflowSkillCleanup(
  workspaceRoot: string,
  adapter: AgentAdapter,
  context: { dryRun: boolean; result: InstallAgentAdaptersResult },
): Promise<void> {
  const skillRoot = adapter === "claude" ? ".claude/skills" : ".agents/skills";
  for (const skillName of oldWorkflowSkillNames) {
    const skillPath = `${skillRoot}/${skillName}/SKILL.md`;
    const skillContents = await readOptionalTextFile(path.join(workspaceRoot, skillPath));
    if (skillContents === undefined) {
      continue;
    }

    if (!isHarnessManagedSkill(skillContents)) {
      context.result.conflicts.push({
        path: skillPath,
        reason:
          "Old OKF Harness workflow skill is not marked as managed. It was preserved for review.",
      });
      continue;
    }

    context.result.removedFiles.push(skillPath);
    if (context.dryRun) {
      continue;
    }

    await rm(path.join(workspaceRoot, skillRoot, skillName), { recursive: true, force: true });
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

- \`${routePrefix}okf-harness\` for setup, check, ingest, answer, and graph workflows.

Rules:

- \`raw/sources/\` is immutable. Never edit source files.
- \`wiki/\` is the OKF bundle and may be edited by the agent.
- Use \`okfh --json\` through the local shell for deterministic harness operations.
- Desktop App and TUI sessions use the same local shell command workflow.
- If \`okfh\` or shell access fails, run \`okfh doctor --json\` when possible and report the failed checks.
- Run \`okfh check --workspace <workspace> --json\` after modifying wiki files.
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
    !isBaseWorkspacePlaceholder(existing) &&
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
  if (existing === undefined || isBaseWorkspacePlaceholder(existing)) {
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

function isBaseWorkspacePlaceholder(contents: string): boolean {
  return (
    contents.trim() === "@AGENTS.md" ||
    contents.includes("Placeholder. Install agent guidance with okfh init or okfh agent.")
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
    ...skill.references.map((reference) => ({
      path: `${skillRoot}/${skill.name}/references/${reference.path}`,
      contents: reference.body,
    })),
  ]);
}

function renderSkill(skill: SkillTemplate, version: string): string {
  return `---
name: ${skill.name}
description: ${skill.description}
license: Apache-2.0
compatibility: Designed for Claude Code and Codex with local shell command access. Requires the okfh CLI.
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

## Internal Workflows

${bulletList(
  skill.references.map((reference) => `[${reference.title}](references/${reference.path})`),
)}
`;
}

function numberedList(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}
