import { execFile } from "node:child_process";
import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { stringify as stringifyYaml } from "yaml";
import { readWorkspaceConfig, type WorkspaceConfig } from "../config/index.js";
import { type LintResult, lintWorkspace } from "../lint/index.js";
import { scanConcepts } from "../okf/concepts.js";
import { toPosixRelativePath } from "../paths/index.js";

export type WorkspaceWarning = {
  code: string;
  message: string;
};

export type InitWorkspaceOptions = {
  workspaceRoot: string;
  name: string;
  now?: Date;
  dryRun?: boolean;
  git?: boolean;
};

export type InitWorkspaceResult = {
  workspaceRoot: string;
  name: string;
  dryRun: boolean;
  git: {
    requested: boolean;
    initialized: boolean;
  };
  files: string[];
  directories: string[];
  lint: LintResult;
  warnings: WorkspaceWarning[];
};

export type WorkspacePlanFile = {
  path: string;
  contents: string;
};

export type WorkspacePlan = {
  name: string;
  createdAt: string;
  directories: string[];
  files: WorkspacePlanFile[];
  warnings: WorkspaceWarning[];
};

export type WorkspaceStatus = {
  workspaceRoot: string;
  initialized: boolean;
  name?: string;
  wikiFiles: number;
  concepts: number;
  lint: LintResult;
  warnings: WorkspaceWarning[];
};

export const WORKSPACE_NOT_FOUND = "WORKSPACE_NOT_FOUND" as const;

export class WorkspaceResolutionError extends Error {
  readonly code = WORKSPACE_NOT_FOUND;

  constructor(
    message: string,
    readonly startDir: string,
  ) {
    super(message);
    this.name = "WorkspaceResolutionError";
  }
}

export class WorkspaceInitError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "WorkspaceInitError";
  }
}

const execFileAsync = promisify(execFile);

export async function initWorkspace(options: InitWorkspaceOptions): Promise<InitWorkspaceResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const plan =
    options.now === undefined
      ? createWorkspacePlan({ name: options.name })
      : createWorkspacePlan({ name: options.name, now: options.now });

  await assertWorkspaceCanBeInitialized(workspaceRoot);

  if (options.dryRun === true) {
    return {
      workspaceRoot,
      name: plan.name,
      dryRun: true,
      git: {
        requested: options.git === true,
        initialized: false,
      },
      files: plan.files.map((file) => file.path),
      directories: plan.directories,
      lint: {
        ok: true,
        issues: [],
      },
      warnings: plan.warnings,
    };
  }

  await mkdir(workspaceRoot, { recursive: true });

  await Promise.all(
    plan.directories.map((directory) =>
      mkdir(path.join(workspaceRoot, directory), { recursive: true }),
    ),
  );

  await Promise.all(
    plan.files.map((file) => writeTextFile(path.join(workspaceRoot, file.path), file.contents)),
  );

  const gitInitialized = options.git === true ? await initializeGit(workspaceRoot) : false;
  const lint = await lintWorkspace(workspaceRoot);

  return {
    workspaceRoot,
    name: plan.name,
    dryRun: false,
    git: {
      requested: options.git === true,
      initialized: gitInitialized,
    },
    files: plan.files.map((file) => file.path),
    directories: plan.directories,
    lint,
    warnings: plan.warnings,
  };
}

async function initializeGit(workspaceRoot: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["init"], { cwd: workspaceRoot });
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new WorkspaceInitError("git executable was not found.", "DEPENDENCY_MISSING");
    }
    throw error;
  }
}

export async function readWorkspaceStatus(workspaceRootInput: string): Promise<WorkspaceStatus> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const configResult = await readWorkspaceConfig(workspaceRoot);
  if (!configResult.ok) {
    return {
      workspaceRoot,
      initialized: false,
      wikiFiles: 0,
      concepts: 0,
      lint: {
        ok: false,
        issues: configResult.issues.map((issue) => ({
          code: issue.code,
          severity: "error",
          message: issue.message,
          path: issue.path,
        })),
      },
      warnings: [],
    };
  }

  const [scanResult, lint] = await Promise.all([
    scanConcepts(workspaceRoot, configResult.config),
    lintWorkspace(workspaceRoot),
  ]);

  return {
    workspaceRoot,
    initialized: true,
    name: configResult.config.workspace.name,
    wikiFiles: scanResult.files.length,
    concepts: scanResult.concepts.length,
    lint,
    warnings: [],
  };
}

export async function resolveWorkspaceRoot(options: {
  workspaceRoot?: string | undefined;
  startDir?: string | undefined;
}): Promise<string> {
  if (options.workspaceRoot !== undefined && options.workspaceRoot.trim().length > 0) {
    return path.resolve(options.workspaceRoot);
  }

  const startDir = path.resolve(options.startDir ?? process.cwd());
  const nearest = await findNearestWorkspaceRoot(startDir);
  if (nearest === undefined) {
    throw new WorkspaceResolutionError(
      "Could not find okfh.config.yaml in the current directory or its parents.",
      startDir,
    );
  }
  return nearest;
}

async function findNearestWorkspaceRoot(startDir: string): Promise<string | undefined> {
  let current = startDir;
  while (true) {
    try {
      await access(path.join(current, "okfh.config.yaml"));
      return current;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function createWorkspacePlan(options: { name: string; now?: Date }): WorkspacePlan {
  const createdAt = (options.now ?? new Date()).toISOString();
  const logDate = createdAt.slice(0, "YYYY-MM-DD".length);
  const config = createWorkspaceConfig(options.name, createdAt);

  return {
    name: options.name,
    createdAt,
    directories: workspaceDirectories(),
    files: workspaceFiles(options.name, logDate, config),
    warnings: [],
  };
}

function workspaceDirectories(): string[] {
  return [
    ".agents/skills",
    ".claude/skills",
    ".codex",
    ".okfh/cache",
    ".okfh/reports",
    "raw/assets",
    "raw/inbox",
    "raw/sources",
    "wiki/decisions",
    "wiki/entities",
    "wiki/projects",
    "wiki/questions",
    "wiki/references",
    "wiki/topics",
  ];
}

async function assertWorkspaceCanBeInitialized(workspaceRoot: string): Promise<void> {
  try {
    const workspaceStat = await stat(workspaceRoot);
    if (!workspaceStat.isDirectory()) {
      throw new WorkspaceInitError(
        "Workspace path exists and is not a directory.",
        "INIT_NOT_DIRECTORY",
      );
    }

    const entries = await readdir(workspaceRoot);
    if (entries.length > 0) {
      throw new WorkspaceInitError("Workspace path exists and is not empty.", "INIT_NOT_EMPTY");
    }
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return;
    }
    throw error;
  }
}

function createWorkspaceConfig(name: string, createdAt: string): WorkspaceConfig {
  return {
    version: "0.1",
    workspace: {
      name,
      created_at: createdAt,
    },
    okf: {
      bundle_root: "wiki",
      profile: "okf-harness-default",
    },
    paths: {
      raw_inbox: "raw/inbox",
      raw_sources: "raw/sources",
      wiki_root: "wiki",
      manifest: ".okfh/manifest.jsonl",
    },
    safety: {
      require_git_checkpoint_before_agent_write: true,
      max_files_changed_per_ingest: 20,
    },
  };
}

function workspaceFiles(
  name: string,
  logDate: string,
  config: WorkspaceConfig,
): WorkspacePlanFile[] {
  return [
    {
      path: "README.md",
      contents: `# ${name}\n\nThis is an OKF Harness workspace.\n`,
    },
    {
      path: "AGENTS.md",
      contents:
        "# OKF Harness workspace\n\nPlaceholder. Install agent guidance with okfh init or okfh agent.\n",
    },
    {
      path: "CLAUDE.md",
      contents: "@AGENTS.md\n",
    },
    {
      path: ".agents/skills/.gitkeep",
      contents: "",
    },
    {
      path: ".claude/skills/.gitkeep",
      contents: "",
    },
    {
      path: ".codex/.gitkeep",
      contents: "",
    },
    {
      path: ".gitignore",
      contents:
        "# OKF Harness generated caches\n.okfh/cache/\n.okfh/*.sqlite\n.okfh/backlinks.json\n.okfh/reports/graph.html\n.okfh/reports/*.tmp\n\n# OS\n.DS_Store\n\n# Secrets\n.env\n.env.*\n!.env.example\n",
    },
    {
      path: ".okfh/cache/.gitkeep",
      contents: "",
    },
    {
      path: ".okfh/manifest.jsonl",
      contents: "",
    },
    {
      path: ".okfh/reports/.gitkeep",
      contents: "",
    },
    {
      path: "okfh.config.yaml",
      contents: stringifyYaml(config),
    },
    {
      path: "raw/assets/README.md",
      contents: "# Assets\n\nStore local assets referenced by wiki pages here.\n",
    },
    {
      path: "raw/inbox/README.md",
      contents:
        "# Inbox\n\nDrop unregistered source material here before adding it to OKF Harness.\n",
    },
    {
      path: "raw/sources/README.md",
      contents:
        "# Sources\n\nRegistered raw sources live here and should not be edited in place.\n",
    },
    {
      path: "wiki/index.md",
      contents: `# ${name} Wiki\n\n## Concepts\n\n- [Topics](/topics/index.md)\n- [References](/references/index.md)\n`,
    },
    {
      path: "wiki/log.md",
      contents: `# Log\n\n## ${logDate}\n\n- Initialized the OKF Harness workspace.\n`,
    },
    ...workspaceIndexFiles([
      "decisions",
      "entities",
      "projects",
      "questions",
      "references",
      "topics",
    ]),
  ].map((file) => ({
    path: toPosixRelativePath(".", file.path),
    contents: file.contents,
  }));
}

function workspaceIndexFiles(directories: string[]): WorkspacePlanFile[] {
  return directories.map((directory) => ({
    path: `wiki/${directory}/index.md`,
    contents: `# ${titleCase(directory)}\n\nNo entries yet.\n`,
  }));
}

async function writeTextFile(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function titleCase(input: string): string {
  return input
    .split("-")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
