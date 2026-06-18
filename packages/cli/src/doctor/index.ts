import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  readWorkspaceStatus,
  resolveWorkspaceRoot,
  WorkspaceResolutionError,
} from "@okf-harness/core";

export type DoctorCheckStatus = "pass" | "warn" | "fail" | "skip";

export type DoctorCheck = {
  id: string;
  label: string;
  status: DoctorCheckStatus;
  message: string;
  details?: Record<string, unknown>;
};

export type DoctorResult = {
  ok: boolean;
  workspace: string | null;
  checks: DoctorCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    skip: number;
  };
};

export type RunDoctorOptions = {
  workspaceRoot?: string | undefined;
  startDir?: string | undefined;
  runtimePlatform?: NodeJS.Platform | string | undefined;
  runExecutable?: RunExecutable | undefined;
};

export type RunExecutable = (
  executable: string,
  args: string[],
  options: { shell?: boolean | undefined },
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile);
const requiredSkillFiles = [
  "okf-harness/SKILL.md",
  "okf-harness/references/setup.md",
  "okf-harness/references/check.md",
  "okf-harness/references/ingest.md",
  "okf-harness/references/answer.md",
  "okf-harness/references/graph.md",
] as const;

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorResult> {
  const runtimePlatform = options.runtimePlatform ?? process.platform;
  const runExecutable = options.runExecutable ?? runExecutableDefault;
  const checks: DoctorCheck[] = [
    checkOkfh(),
    checkPlatform(runtimePlatform),
    checkNode(),
    await checkExecutable("git", ["--version"], {
      id: "git",
      label: "git",
      missingMessage: "git executable was not found.",
      runtimePlatform,
      runExecutable,
    }),
    await checkExecutable("pnpm", ["--version"], {
      id: "pnpm",
      label: "pnpm",
      missingMessage: "pnpm executable was not found.",
      outputPrefix: "pnpm ",
      runtimePlatform,
      runExecutable,
    }),
  ];

  const workspaceRoot = await resolveDoctorWorkspace(options, checks);
  if (workspaceRoot === null) {
    checks.push(skipCheck("workspace-status", "Workspace status", "No workspace was resolved."));
    checks.push(skipCheck("claude-adapter", "Claude Code adapter", "No workspace was resolved."));
    checks.push(skipCheck("codex-adapter", "Codex adapter", "No workspace was resolved."));
  } else {
    checks.push(await checkWorkspaceStatus(workspaceRoot));
    checks.push(await checkAdapter(workspaceRoot, "claude"));
    checks.push(await checkAdapter(workspaceRoot, "codex"));
  }

  const summary = summarizeChecks(checks);
  return {
    ok: summary.fail === 0,
    workspace: workspaceRoot,
    checks,
    summary,
  };
}

function checkOkfh(): DoctorCheck {
  return {
    id: "okfh",
    label: "okfh CLI",
    status: "pass",
    message: "The current okfh CLI entrypoint is running.",
    details: {
      argv0: process.argv[1] ?? null,
      pid: process.pid,
    },
  };
}

function checkPlatform(runtimePlatform: NodeJS.Platform | string): DoctorCheck {
  const platformLabel = platformLabelFor(runtimePlatform);
  const supported = platformLabel !== null;
  return {
    id: "platform",
    label: "Runtime platform",
    status: supported ? "pass" : "fail",
    message: supported
      ? `${platformLabel} is supported by OKF Harness.`
      : `Node platform ${runtimePlatform} is not supported by OKF Harness.`,
    details: {
      nodePlatform: runtimePlatform,
      okfHarnessPlatform: platformLabel,
      supported,
    },
  };
}

function platformLabelFor(runtimePlatform: NodeJS.Platform | string): string | null {
  switch (runtimePlatform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return null;
  }
}

function checkNode(): DoctorCheck {
  const version = process.versions.node;
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  if (Number.isFinite(major) && major >= 22) {
    return {
      id: "node",
      label: "Node.js",
      status: "pass",
      message: `Node.js ${version} satisfies the >=22 runtime requirement.`,
      details: { version },
    };
  }

  return {
    id: "node",
    label: "Node.js",
    status: "fail",
    message: `Node.js ${version} does not satisfy the >=22 runtime requirement.`,
    details: { version, required: ">=22.0.0" },
  };
}

async function checkExecutable(
  executable: string,
  args: string[],
  options: {
    id: string;
    label: string;
    missingMessage: string;
    outputPrefix?: string | undefined;
    runtimePlatform: NodeJS.Platform | string;
    runExecutable: RunExecutable;
  },
): Promise<DoctorCheck> {
  try {
    const { stdout, stderr } = await options.runExecutable(executable, args, {
      shell: shouldUseWindowsShell(options.runtimePlatform, executable),
    });
    const output = `${stdout}${stderr}`.trim();
    return {
      id: options.id,
      label: options.label,
      status: "pass",
      message:
        output.length > 0
          ? `${options.outputPrefix ?? ""}${output}`
          : `${executable} is available.`,
      details: { executable },
    };
  } catch (error) {
    const code = nodeErrorCode(error);
    return {
      id: options.id,
      label: options.label,
      status: "fail",
      message: code === "ENOENT" ? options.missingMessage : `${executable} check failed.`,
      details: {
        executable,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function runExecutableDefault(
  executable: string,
  args: string[],
  options: { shell?: boolean | undefined },
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(executable, args, {
    shell: options.shell === true,
    windowsHide: true,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}

function shouldUseWindowsShell(
  runtimePlatform: NodeJS.Platform | string,
  executable: string,
): boolean {
  return runtimePlatform === "win32" && ["npm", "pnpm"].includes(executable);
}

async function resolveDoctorWorkspace(
  options: RunDoctorOptions,
  checks: DoctorCheck[],
): Promise<string | null> {
  try {
    return await resolveWorkspaceRoot({
      workspaceRoot: options.workspaceRoot,
      startDir: options.startDir,
    });
  } catch (error) {
    if (error instanceof WorkspaceResolutionError) {
      checks.push({
        id: "workspace-resolution",
        label: "Workspace resolution",
        status: options.workspaceRoot === undefined ? "warn" : "fail",
        message:
          options.workspaceRoot === undefined
            ? "No okfh.config.yaml was found from the current directory or its parents."
            : "The requested workspace could not be resolved.",
        details: { startDir: error.startDir },
      });
      return null;
    }
    throw error;
  }
}

async function checkWorkspaceStatus(workspaceRoot: string): Promise<DoctorCheck> {
  const status = await readWorkspaceStatus(workspaceRoot);
  if (!status.initialized) {
    return {
      id: "workspace-status",
      label: "Workspace status",
      status: "fail",
      message: "Workspace is not initialized or okfh.config.yaml is invalid.",
      details: {
        workspace: status.workspaceRoot,
        lintIssues: status.lint.issues.length,
      },
    };
  }

  return {
    id: "workspace-status",
    label: "Workspace status",
    status: status.lint.ok ? "pass" : "warn",
    message: status.lint.ok
      ? `Workspace ${status.name ?? workspaceRoot} is initialized and lint passes.`
      : `Workspace ${status.name ?? workspaceRoot} is initialized but lint has issues.`,
    details: {
      workspace: status.workspaceRoot,
      name: status.name ?? null,
      wikiFiles: status.wikiFiles,
      concepts: status.concepts,
      lintOk: status.lint.ok,
      lintIssues: status.lint.issues.length,
    },
  };
}

async function checkAdapter(
  workspaceRoot: string,
  adapter: "claude" | "codex",
): Promise<DoctorCheck> {
  const rootGuidance = adapter === "claude" ? "CLAUDE.md" : "AGENTS.md";
  const skillRoot = adapter === "claude" ? ".claude/skills" : ".agents/skills";
  const missingFiles: string[] = [];
  const rootPath = path.join(workspaceRoot, rootGuidance);
  const rootContents = await readOptionalText(rootPath);

  if (rootContents === undefined) {
    missingFiles.push(rootGuidance);
  }
  for (const skill of requiredSkillFiles) {
    const skillPath = `${skillRoot}/${skill}`;
    if (!(await fileExists(path.join(workspaceRoot, skillPath)))) {
      missingFiles.push(skillPath);
    }
  }

  const hasManagedBlock =
    rootContents?.includes("<!-- OKF Harness: start -->") === true &&
    rootContents.includes("<!-- OKF Harness: end -->");
  if (missingFiles.length === 0 && hasManagedBlock) {
    return {
      id: `${adapter}-adapter`,
      label: adapter === "claude" ? "Claude Code adapter" : "Codex adapter",
      status: "pass",
      message: `${adapter === "claude" ? "Claude Code" : "Codex"} adapter files are installed.`,
      details: { rootGuidance, skillRoot },
    };
  }

  return {
    id: `${adapter}-adapter`,
    label: adapter === "claude" ? "Claude Code adapter" : "Codex adapter",
    status: "warn",
    message: `${adapter === "claude" ? "Claude Code" : "Codex"} adapter support is incomplete.`,
    details: {
      rootGuidance,
      skillRoot,
      hasManagedBlock,
      missingFiles,
      repairCommand: `okfh agent install ${adapter} --workspace <workspace> --json`,
    },
  };
}

function skipCheck(id: string, label: string, message: string): DoctorCheck {
  return {
    id,
    label,
    status: "skip",
    message,
  };
}

function summarizeChecks(checks: DoctorCheck[]): DoctorResult["summary"] {
  return checks.reduce(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 },
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
