import { readFileSync } from "node:fs";
import { cp, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  backupDirectories: string[];
  skippedFiles: string[];
  conflicts: AgentInstallConflict[];
  managedBlocks: ManagedBlockResult[];
};

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const managedBlockStart = "<!-- OKF Harness: start -->";
const managedBlockEnd = "<!-- OKF Harness: end -->";
const skillName = "okf-harness";
const skillDescription =
  "One Door workflow for OKF Harness workspaces. Use when the user asks to set up, check, ingest into, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, ordinary repository maintenance, knowledge-base tasks outside an OKF Harness workspace, repository dependency graphs, old workflow-specific skill names, or an `okfh query` command.";
const referenceTemplatePaths = ["setup.md", "check.md", "ingest.md", "answer.md", "graph.md"];

export function renderAgentAdapter(options: RenderAgentAdapterOptions): RenderedAgentAdapter {
  const version = options.version ?? packageVersion.version;
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
    backupDirectories: [],
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
    const conflictCountBeforeAdapter = context.result.conflicts.length;
    for (const file of renderAgentAdapter({ adapter }).files) {
      if (isRootGuidancePath(file.path)) {
        await planRootGuidanceWrite(workspaceRoot, file, context);
      } else {
        await planManagedFileWrite(workspaceRoot, file, context);
      }
    }
    if (context.result.conflicts.length === conflictCountBeforeAdapter) {
      await planOldWorkflowSkillCleanup(workspaceRoot, adapter, context);
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
    const skillDirectory = `${skillRoot}/${skillName}`;
    const skillPath = `${skillDirectory}/SKILL.md`;
    if (!(await directoryExists(path.join(workspaceRoot, skillDirectory)))) {
      continue;
    }

    const skillContents = await readOptionalTextFile(path.join(workspaceRoot, skillPath));
    context.result.removedFiles.push(skillContents === undefined ? skillDirectory : skillPath);
    if (context.dryRun) {
      continue;
    }

    const backupDirectory = await backupOldWorkflowSkillDirectory(workspaceRoot, skillDirectory);
    context.result.backupDirectories.push(backupDirectory);
    await rm(path.join(workspaceRoot, skillDirectory), { recursive: true, force: true });
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
    !(await hasManagedSiblingSkill(workspaceRoot, file.path)) &&
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

async function backupOldWorkflowSkillDirectory(
  workspaceRoot: string,
  skillDirectory: string,
): Promise<string> {
  const backupRoot = path.join(
    workspaceRoot,
    ".okfh/backups/agent-skills",
    backupTimestamp(new Date()),
  );
  const source = path.join(workspaceRoot, skillDirectory);
  const destination = path.join(backupRoot, skillDirectory);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
  return toPosixRelativePath(workspaceRoot, destination);
}

function backupTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "");
}

function isHarnessManagedSkill(contents: string): boolean {
  const frontmatter = frontmatterBlock(contents);
  if (frontmatter === undefined) {
    return false;
  }

  return frontmatterMetadataValue(frontmatter, "okf-harness-managed") === "true";
}

async function hasManagedSiblingSkill(workspaceRoot: string, filePath: string): Promise<boolean> {
  const siblingSkillPath = siblingSkillPathForReference(filePath);
  if (siblingSkillPath === undefined) {
    return false;
  }

  const contents = await readOptionalTextFile(path.join(workspaceRoot, siblingSkillPath));
  return contents !== undefined && isHarnessManagedSkill(contents);
}

function siblingSkillPathForReference(filePath: string): string | undefined {
  const segments = filePath.split("/");
  const skillsIndex = segments.indexOf("skills");
  if (
    skillsIndex === -1 ||
    segments[skillsIndex + 1] === undefined ||
    segments[skillsIndex + 2] !== "references"
  ) {
    return undefined;
  }

  return [...segments.slice(0, skillsIndex + 2), "SKILL.md"].join("/");
}

function frontmatterBlock(contents: string): string | undefined {
  if (!contents.startsWith("---\n")) {
    return undefined;
  }
  const end = contents.indexOf("\n---", "---\n".length);
  return end === -1 ? undefined : contents.slice("---\n".length, end);
}

function frontmatterMetadataValue(frontmatter: string, key: string): string | undefined {
  let inMetadata = false;
  for (const line of frontmatter.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inMetadata = line.trim() === "metadata:";
      continue;
    }
    if (!inMetadata) {
      continue;
    }

    const match = new RegExp(`^\\s{2}${escapeRegExp(key)}:\\s*(.+?)\\s*$`).exec(line);
    if (match?.[1] !== undefined) {
      return parseFrontmatterScalar(match[1]);
    }
  }
  return undefined;
}

function parseFrontmatterScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosixRelativePath(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join(path.posix.sep);
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

async function directoryExists(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isDirectory();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
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
  return [
    {
      path: `${skillRoot}/${skillName}/SKILL.md`,
      contents: renderSkill(version),
    },
    ...referenceTemplatePaths.map((templatePath) => ({
      path: `${skillRoot}/${skillName}/references/${templatePath}`,
      contents: readTemplate(`references/${templatePath}`),
    })),
  ];
}

function renderSkill(version: string): string {
  return `---
name: ${skillName}
description: ${skillDescription}
license: Apache-2.0
compatibility: Designed for Claude Code and Codex with local shell command access. Requires the okfh CLI.
metadata:
  okf-harness-version: "${version}"
  okf-harness-managed: "true"
---

${readTemplate("SKILL.md")}`;
}

function readTemplate(relativePath: string): string {
  return readFileSync(new URL(`../templates/okf-harness/${relativePath}`, import.meta.url), "utf8");
}
