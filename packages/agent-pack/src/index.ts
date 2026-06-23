import { constants, readFileSync } from "node:fs";
import {
  access,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const packageInfo = {
  name: "@okf-harness/agent-pack",
  role: "agent-pack",
} as const;

export type PackageInfo = typeof packageInfo;

export type AgentAdapter = "claude" | "codex";
export type AgentInstallTarget = AgentAdapter | "all";
export type BootstrapAgent = "claude" | "codex";
export const supportedBootstrapAgents: BootstrapAgent[] = ["codex", "claude"];

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

export type RenderBootstrapAgentOptions = {
  agent: BootstrapAgent;
  version?: string;
};

export type RenderedBootstrapAgent = {
  agent: BootstrapAgent;
  files: RenderedAgentFile[];
};

export type BootstrapStatusState =
  | "missing"
  | "installed"
  | "version-drifted"
  | "unmanaged-conflict";

export type BootstrapVersionDrift = "older" | "newer" | "unknown";

export type BootstrapAgentDetection = {
  agent: BootstrapAgent;
  label: string;
  detected: boolean;
  executable: {
    command: string;
    detected: boolean;
    path?: string;
  };
  userStateDirectory: {
    path: string;
    detected: boolean;
  };
};

export type BootstrapStatus = {
  agent: BootstrapAgent;
  skillName: string;
  targetDirectory: string;
  skillDirectory: string;
  skillPath: string;
  state: BootstrapStatusState;
  expectedVersion: string;
  managed: boolean;
  detection: BootstrapAgentDetection;
  next: string[];
  actualVersion?: string;
  entrypoint?: string;
  versionDrift?: BootstrapVersionDrift;
  reason?: string;
  conflictPath?: string;
};

export type BootstrapAgentOptions = {
  agent: BootstrapAgent;
  env?: NodeJS.ProcessEnv;
};

export type BootstrapLifecycleOptions = BootstrapAgentOptions & {
  dryRun?: boolean;
};

export type BootstrapLifecycleResult = {
  agent: BootstrapAgent;
  dryRun: boolean;
  status: BootstrapStatus;
  plannedWrites: string[];
  plannedRemovals: string[];
  writtenFiles: string[];
  replacedFiles: string[];
  removedFiles: string[];
  skippedFiles: string[];
  conflicts: AgentInstallConflict[];
};

type BootstrapTarget = {
  agent: BootstrapAgent;
  targetDirectory: string;
  skillsDirectory: string;
  skillName: string;
  skillDirectory: string;
  skillPath: string;
  expectedVersion: string;
};

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const managedBlockStart = "<!-- OKF Harness: start -->";
const managedBlockEnd = "<!-- OKF Harness: end -->";
const skillName = "okf-harness";
const bootstrapSkillName = "okf-harness-bootstrap";
const skillDescription =
  "One Door workflow for OKF Harness workspaces. Use when the user asks to set up, check, ingest into, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, ordinary repository maintenance, knowledge-base tasks outside an OKF Harness workspace, repository dependency graphs, old workflow-specific skill names, or an `okfh query` command.";
const referenceTemplatePaths = ["setup.md", "check.md", "ingest.md", "answer.md", "graph.md"];
const bootstrapReferenceTemplatePaths = ["setup.md", "discovery.md", "repair.md"];
const bootstrapAgentProfiles: Record<
  BootstrapAgent,
  {
    command: string;
    label: string;
    routePrefix: string;
    targetDirectoryEnv?: string;
    targetDirectory: string;
    stateDirectoryEnv: string;
    stateDirectory: string;
    sessionName: string;
    compatibility: string;
    description: string;
  }
> = {
  codex: {
    command: "codex",
    label: "Codex",
    routePrefix: "$",
    targetDirectory: ".agents",
    stateDirectoryEnv: "CODEX_HOME",
    stateDirectory: ".codex",
    sessionName: "Codex thread",
    compatibility: "Designed for Codex with local shell command access. Requires the okfh CLI.",
    description:
      "Bootstrap OKF Harness before a workspace exists. Use when the user asks to create, find, select, repair, or enter an OKF Harness workspace from Codex. Do not use for workspace-local check, ingest, answer, graph, generic Markdown editing, repository maintenance, or non-OKF knowledge-base work.",
  },
  claude: {
    command: "claude",
    label: "Claude Code",
    routePrefix: "/",
    targetDirectoryEnv: "CLAUDE_CONFIG_DIR",
    targetDirectory: ".claude",
    stateDirectoryEnv: "CLAUDE_CONFIG_DIR",
    stateDirectory: ".claude",
    sessionName: "Claude Code session",
    compatibility:
      "Designed for Claude Code with local shell command access. Requires the okfh CLI.",
    description:
      "Bootstrap OKF Harness before a workspace exists. Use when the user asks to create, find, select, repair, or enter an OKF Harness workspace from Claude Code. Do not use for workspace-local check, ingest, answer, graph, generic Markdown editing, repository maintenance, or non-OKF knowledge-base work.",
  },
};
const adapterProfiles: Record<
  AgentAdapter,
  {
    rootGuidancePath: string;
    routePrefix: string;
    routeLabel: string;
    skillRoot: string;
  }
> = {
  claude: {
    rootGuidancePath: "CLAUDE.md",
    routePrefix: "/",
    routeLabel: "Use the project skills for user-facing workflows:",
    skillRoot: ".claude/skills",
  },
  codex: {
    rootGuidancePath: "AGENTS.md",
    routePrefix: "$",
    routeLabel: "Use repo skills for workflows:",
    skillRoot: ".agents/skills",
  },
};
const allAdapters = Object.keys(adapterProfiles) as AgentAdapter[];

export function renderAgentAdapter(options: RenderAgentAdapterOptions): RenderedAgentAdapter {
  const version = options.version ?? packageVersion.version;
  return {
    adapter: options.adapter,
    files: [renderRootGuidance(options.adapter), ...renderSkillFiles(options.adapter, version)],
  };
}

export function renderBootstrapAgent(options: RenderBootstrapAgentOptions): RenderedBootstrapAgent {
  const version = options.version ?? packageVersion.version;
  return {
    agent: options.agent,
    files: renderBootstrapSkillFiles(options.agent, version),
  };
}

export async function detectBootstrapAgent(
  options: BootstrapAgentOptions,
): Promise<BootstrapAgentDetection> {
  const env = options.env ?? process.env;
  const profile = bootstrapAgentProfiles[options.agent];
  const stateDirectory = resolveBootstrapStateDirectory(options.agent, env);
  const [executablePath, userStateDirectoryDetected] = await Promise.all([
    findExecutable(profile.command, env),
    directoryExists(stateDirectory),
  ]);
  return {
    agent: options.agent,
    label: profile.label,
    detected: executablePath !== undefined || userStateDirectoryDetected,
    executable: {
      command: profile.command,
      detected: executablePath !== undefined,
      ...(executablePath === undefined ? {} : { path: executablePath }),
    },
    userStateDirectory: {
      path: stateDirectory,
      detected: userStateDirectoryDetected,
    },
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

export async function readBootstrapAgentStatus(
  options: BootstrapAgentOptions,
): Promise<BootstrapStatus> {
  const target = bootstrapTarget(options);
  const detection = await detectBootstrapAgent(options);
  const pathConflict = await bootstrapPathConflict(target);
  if (pathConflict !== undefined) {
    return createBootstrapStatus({
      ...target,
      detection,
      state: "unmanaged-conflict",
      managed: false,
      reason: pathConflict.reason,
      conflictPath: pathConflict.path,
    });
  }

  const contents = await readOptionalTextFile(target.skillPath);
  if (contents === undefined) {
    if (await directoryHasEntries(target.skillDirectory)) {
      return createBootstrapStatus({
        ...target,
        detection,
        state: "unmanaged-conflict",
        managed: false,
        reason: "Bootstrap skill directory exists without a managed SKILL.md.",
      });
    }
    return createBootstrapStatus({ ...target, detection, state: "missing", managed: false });
  }

  const frontmatter = frontmatterBlock(contents);
  const managed =
    frontmatter !== undefined &&
    frontmatterMetadataValue(frontmatter, "okf-harness-managed") === "true";
  if (!managed) {
    return createBootstrapStatus({
      ...target,
      detection,
      state: "unmanaged-conflict",
      managed: false,
      reason: "Existing bootstrap skill is not marked as OKF Harness managed.",
    });
  }

  const actualVersion = frontmatterMetadataValue(frontmatter, "okf-harness-version");
  const entrypoint = frontmatterMetadataValue(frontmatter, "okf-harness-entrypoint");
  const skillAgent = frontmatterMetadataValue(frontmatter, "okf-harness-agent");
  if (entrypoint !== undefined && entrypoint !== "bootstrap") {
    return createBootstrapStatus({
      ...target,
      detection,
      state: "unmanaged-conflict",
      managed: true,
      actualVersion,
      entrypoint,
      reason: `Managed skill is marked as ${entrypoint}, not bootstrap.`,
    });
  }
  if (skillAgent !== undefined && skillAgent !== options.agent) {
    return createBootstrapStatus({
      ...target,
      detection,
      state: "unmanaged-conflict",
      managed: true,
      actualVersion,
      entrypoint,
      reason: `Managed skill is marked for ${skillAgent}, not ${options.agent}.`,
    });
  }

  if (
    actualVersion !== target.expectedVersion ||
    entrypoint !== "bootstrap" ||
    skillAgent !== target.agent
  ) {
    return createBootstrapStatus({
      ...target,
      detection,
      state: "version-drifted",
      managed: true,
      actualVersion,
      entrypoint,
      versionDrift: versionDrift(actualVersion, target.expectedVersion),
      reason:
        entrypoint !== "bootstrap"
          ? "Managed skill is missing bootstrap entrypoint metadata."
          : skillAgent !== target.agent
            ? `Managed skill is missing ${bootstrapAgentProfiles[target.agent].label} agent metadata.`
            : undefined,
    });
  }

  const renderedDrift = await bootstrapRenderedFilesDrift(target);
  if (renderedDrift !== undefined) {
    return createBootstrapStatus({
      ...target,
      detection,
      state: "version-drifted",
      managed: true,
      actualVersion,
      entrypoint,
      versionDrift: "unknown",
      reason: renderedDrift,
    });
  }

  return createBootstrapStatus({
    ...target,
    detection,
    state: "installed",
    managed: true,
    actualVersion,
    entrypoint,
  });
}

export async function installBootstrapAgent(
  options: BootstrapLifecycleOptions,
): Promise<BootstrapLifecycleResult> {
  const dryRun = options.dryRun === true;
  const status = await readBootstrapAgentStatus(options);
  const result = createBootstrapLifecycleResult(options.agent, dryRun, status);
  if (status.state === "unmanaged-conflict") {
    result.conflicts.push({
      path: status.conflictPath ?? status.skillPath,
      reason: status.reason ?? "Existing bootstrap skill is unmanaged.",
    });
    return result;
  }

  const target = bootstrapTarget(options);
  for (const file of renderBootstrapAgent({ agent: options.agent }).files) {
    const absolutePath = path.join(target.targetDirectory, file.path);
    const existing = await readOptionalTextFile(absolutePath);
    if (existing === file.contents) {
      result.skippedFiles.push(absolutePath);
      continue;
    }

    result.plannedWrites.push(absolutePath);
    if (dryRun) {
      continue;
    }

    await writeRenderedFile(absolutePath, file.contents);
    if (existing === undefined) {
      result.writtenFiles.push(absolutePath);
    } else {
      result.replacedFiles.push(absolutePath);
    }
  }

  result.status = dryRun ? status : await readBootstrapAgentStatus(options);
  return result;
}

export async function uninstallBootstrapAgent(
  options: BootstrapLifecycleOptions,
): Promise<BootstrapLifecycleResult> {
  const dryRun = options.dryRun === true;
  const status = await readBootstrapAgentStatus(options);
  const result = createBootstrapLifecycleResult(options.agent, dryRun, status);
  if (status.state === "unmanaged-conflict") {
    result.conflicts.push({
      path: status.conflictPath ?? status.skillPath,
      reason: status.reason ?? "Existing bootstrap skill is unmanaged.",
    });
    return result;
  }
  if (status.state === "missing") {
    return result;
  }

  const target = bootstrapTarget(options);
  for (const file of renderBootstrapAgent({ agent: options.agent }).files) {
    const absolutePath = path.join(target.targetDirectory, file.path);
    if ((await readOptionalTextFile(absolutePath)) === undefined) {
      result.skippedFiles.push(absolutePath);
      continue;
    }

    result.plannedRemovals.push(absolutePath);
    if (dryRun) {
      continue;
    }

    await rm(absolutePath, { force: true });
    result.removedFiles.push(absolutePath);
  }

  if (!dryRun) {
    await removeEmptyDirectory(path.join(target.skillDirectory, "references"));
    await removeEmptyDirectory(target.skillDirectory);
    result.status = await readBootstrapAgentStatus(options);
  }
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
  const { skillRoot } = adapterProfiles[adapter];
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
  const profile = adapterProfiles[adapter];

  return {
    path: profile.rootGuidancePath,
    contents: `# OKF Harness workspace

${managedBlockStart}
This repository is an OKF Harness workspace.

${profile.routeLabel}

- \`${profile.routePrefix}okf-harness\` for setup, check, ingest, answer, and graph workflows.

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
  return target === "all" ? [...allAdapters] : [target];
}

function isRootGuidancePath(filePath: string): boolean {
  return allAdapters.some((adapter) => adapterProfiles[adapter].rootGuidancePath === filePath);
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

async function findExecutable(
  executable: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const searchPath = firstNonEmpty(env.PATH);
  if (searchPath === undefined) {
    return undefined;
  }

  for (const directory of searchPath.split(path.delimiter)) {
    if (directory.trim().length === 0) {
      continue;
    }
    for (const name of executableNames(executable, env)) {
      const candidate = path.join(directory, name);
      if (await canExecute(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

function executableNames(executable: string, env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32" || path.extname(executable).length > 0) {
    return [executable];
  }
  const extensions = firstNonEmpty(env.PATHEXT)
    ?.split(";")
    .filter((extension) => extension.trim().length > 0) ?? [".EXE", ".CMD", ".BAT", ".COM"];
  return [executable, ...extensions.map((extension) => `${executable}${extension}`)];
}

async function canExecute(filePath: string): Promise<boolean> {
  try {
    if (!(await lstat(filePath)).isFile()) {
      return false;
    }
    await access(filePath, constants.X_OK);
    return true;
  } catch (error) {
    if (isNodeError(error)) {
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

async function directoryHasEntries(filePath: string): Promise<boolean> {
  try {
    return (await readdir(filePath)).length > 0;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function removeEmptyDirectory(filePath: string): Promise<void> {
  try {
    await rmdir(filePath);
  } catch (error) {
    if (
      isNodeError(error) &&
      (error.code === "ENOENT" || error.code === "ENOTEMPTY" || error.code === "EEXIST")
    ) {
      return;
    }
    throw error;
  }
}

function renderSkillFiles(adapter: AgentAdapter, version: string): RenderedAgentFile[] {
  const { skillRoot } = adapterProfiles[adapter];
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
  okf-harness-entrypoint: "workspace"
---

${readTemplate("SKILL.md")}`;
}

function renderBootstrapSkillFiles(agent: BootstrapAgent, version: string): RenderedAgentFile[] {
  return [
    {
      path: `skills/${bootstrapSkillName}/SKILL.md`,
      contents: renderBootstrapSkill(agent, version),
    },
    ...bootstrapReferenceTemplatePaths.map((templatePath) => ({
      path: `skills/${bootstrapSkillName}/references/${templatePath}`,
      contents: renderBootstrapTemplate(`references/${templatePath}`, agent),
    })),
  ];
}

function renderBootstrapSkill(agent: BootstrapAgent, version: string): string {
  const profile = bootstrapAgentProfiles[agent];
  return `---
name: ${bootstrapSkillName}
description: ${profile.description}
license: Apache-2.0
compatibility: ${profile.compatibility}
metadata:
  okf-harness-version: "${version}"
  okf-harness-managed: "true"
  okf-harness-entrypoint: "bootstrap"
  okf-harness-agent: "${agent}"
---

${renderBootstrapTemplate("SKILL.md", agent)}`;
}

function readTemplate(relativePath: string): string {
  return readFileSync(new URL(`../templates/okf-harness/${relativePath}`, import.meta.url), "utf8");
}

function readBootstrapTemplate(relativePath: string): string {
  return readFileSync(
    new URL(`../templates/okf-harness-bootstrap/${relativePath}`, import.meta.url),
    "utf8",
  );
}

function renderBootstrapTemplate(relativePath: string, agent: BootstrapAgent): string {
  const profile = bootstrapAgentProfiles[agent];
  return replaceTemplateVariables(readBootstrapTemplate(relativePath), {
    agentAdapter: agent,
    agentLabel: profile.label,
    sessionName: profile.sessionName,
    workspaceInvocation: `${profile.routePrefix}${skillName}`,
  });
}

function replaceTemplateVariables(input: string, values: Record<string, string>): string {
  let output = input;
  for (const [key, value] of Object.entries(values)) {
    output = output.split(`{{${key}}}`).join(value);
  }
  return output;
}

function bootstrapTarget(options: BootstrapAgentOptions): BootstrapTarget {
  const targetDirectory = resolveBootstrapTargetDirectory(
    options.agent,
    options.env ?? process.env,
  );
  const skillsDirectory = path.join(targetDirectory, "skills");
  const skillDirectory = path.join(skillsDirectory, bootstrapSkillName);
  return {
    agent: options.agent,
    targetDirectory,
    skillsDirectory,
    skillName: bootstrapSkillName,
    skillDirectory,
    skillPath: path.join(skillDirectory, "SKILL.md"),
    expectedVersion: packageVersion.version,
  };
}

function resolveBootstrapTargetDirectory(agent: BootstrapAgent, env: NodeJS.ProcessEnv): string {
  const profile = bootstrapAgentProfiles[agent];
  const configured =
    profile.targetDirectoryEnv === undefined
      ? undefined
      : firstNonEmpty(env[profile.targetDirectoryEnv]);
  if (configured !== undefined) {
    return path.resolve(configured);
  }

  const userHome = firstNonEmpty(env.HOME, env.USERPROFILE) ?? homedir();
  return path.join(path.resolve(userHome), profile.targetDirectory);
}

function resolveBootstrapStateDirectory(agent: BootstrapAgent, env: NodeJS.ProcessEnv): string {
  const profile = bootstrapAgentProfiles[agent];
  const configured = firstNonEmpty(env[profile.stateDirectoryEnv]);
  if (configured !== undefined) {
    return path.resolve(configured);
  }

  const userHome = firstNonEmpty(env.HOME, env.USERPROFILE) ?? homedir();
  return path.join(path.resolve(userHome), profile.stateDirectory);
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0);
}

function createBootstrapLifecycleResult(
  agent: BootstrapAgent,
  dryRun: boolean,
  status: BootstrapStatus,
): BootstrapLifecycleResult {
  return {
    agent,
    dryRun,
    status,
    plannedWrites: [],
    plannedRemovals: [],
    writtenFiles: [],
    replacedFiles: [],
    removedFiles: [],
    skippedFiles: [],
    conflicts: [],
  };
}

function createBootstrapStatus(options: {
  agent: BootstrapAgent;
  skillName: string;
  targetDirectory: string;
  skillDirectory: string;
  skillPath: string;
  expectedVersion: string;
  state: BootstrapStatusState;
  managed: boolean;
  detection: BootstrapAgentDetection;
  actualVersion?: string | undefined;
  entrypoint?: string | undefined;
  versionDrift?: BootstrapVersionDrift | undefined;
  reason?: string | undefined;
  conflictPath?: string | undefined;
}): BootstrapStatus {
  return {
    agent: options.agent,
    skillName: options.skillName,
    targetDirectory: options.targetDirectory,
    skillDirectory: options.skillDirectory,
    skillPath: options.skillPath,
    state: options.state,
    expectedVersion: options.expectedVersion,
    managed: options.managed,
    detection: options.detection,
    next: bootstrapNextSteps(options.state, options.agent),
    ...(options.actualVersion === undefined ? {} : { actualVersion: options.actualVersion }),
    ...(options.entrypoint === undefined ? {} : { entrypoint: options.entrypoint }),
    ...(options.versionDrift === undefined ? {} : { versionDrift: options.versionDrift }),
    ...(options.reason === undefined ? {} : { reason: options.reason }),
    ...(options.conflictPath === undefined ? {} : { conflictPath: options.conflictPath }),
  };
}

function bootstrapNextSteps(state: BootstrapStatusState, agent: BootstrapAgent): string[] {
  const profile = bootstrapAgentProfiles[agent];
  if (state === "installed") {
    return [
      `Use ${profile.routePrefix}${bootstrapSkillName} from ${profile.label} to create or select an OKF Harness workspace.`,
    ];
  }
  if (state === "unmanaged-conflict") {
    return ["Review the existing okf-harness-bootstrap skill before installing or uninstalling."];
  }
  return [`Run okfh bootstrap repair --agents ${agent} --json to install or repair it.`];
}

function versionDrift(
  actualVersion: string | undefined,
  expectedVersion: string,
): BootstrapVersionDrift {
  if (actualVersion === undefined) {
    return "unknown";
  }
  const comparison = compareVersionStrings(actualVersion, expectedVersion);
  if (comparison === undefined || comparison === 0) {
    return "unknown";
  }
  return comparison < 0 ? "older" : "newer";
}

function compareVersionStrings(left: string, right: string): number | undefined {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  if (leftParts === undefined || rightParts === undefined) {
    return undefined;
  }

  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }
  return 0;
}

function parseVersionParts(version: string): number[] | undefined {
  if (!/^\d+(?:\.\d+)*$/.test(version)) {
    return undefined;
  }
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

async function bootstrapPathConflict(
  target: BootstrapTarget,
): Promise<AgentInstallConflict | undefined> {
  for (const directory of [
    target.targetDirectory,
    target.skillsDirectory,
    target.skillDirectory,
    path.join(target.skillDirectory, "references"),
  ]) {
    const entry = await lstatOptional(directory);
    if (entry === "blocked" || (entry !== undefined && !entry.isDirectory())) {
      return {
        path: directory,
        reason: "Existing bootstrap path is not a managed skill directory.",
      };
    }
  }

  for (const file of renderBootstrapAgent({ agent: target.agent }).files) {
    const absolutePath = path.join(target.targetDirectory, file.path);
    const entry = await lstatOptional(absolutePath);
    if (entry === "blocked" || (entry !== undefined && !entry.isFile())) {
      return {
        path: absolutePath,
        reason: "Existing bootstrap path is not a regular managed file.",
      };
    }
  }

  return undefined;
}

async function bootstrapRenderedFilesDrift(target: BootstrapTarget): Promise<string | undefined> {
  for (const file of renderBootstrapAgent({ agent: target.agent }).files) {
    const absolutePath = path.join(target.targetDirectory, file.path);
    const contents = await readOptionalTextFile(absolutePath);
    if (contents === undefined) {
      return "Managed bootstrap skill is missing generated files.";
    }
    if (contents !== file.contents) {
      return "Managed bootstrap skill files differ from this package version.";
    }
  }
  return undefined;
}

async function lstatOptional(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    if (isNodeError(error) && error.code === "ENOTDIR") {
      return "blocked";
    }
    throw error;
  }
}
