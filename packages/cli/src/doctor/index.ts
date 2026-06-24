import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  type BootstrapAgent,
  readBootstrapAgentStatus,
  supportedBootstrapAgents,
} from "@okf-harness/agent-pack";
import {
  GIT_CHECKPOINT_POLICY_NOT_ENFORCED,
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
  dev?: boolean | undefined;
  runtimePlatform?: NodeJS.Platform | string | undefined;
  runExecutable?: RunExecutable | undefined;
  readBootstrapStatus?: ReadBootstrapStatus | undefined;
};

export type RunExecutable = (
  executable: string,
  args: string[],
  options: { shell?: boolean | undefined },
) => Promise<{ stdout: string; stderr: string }>;

type ReadBootstrapStatus = typeof readBootstrapAgentStatus;

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
  const readBootstrapStatus = options.readBootstrapStatus ?? readBootstrapAgentStatus;
  const checks: DoctorCheck[] = [
    checkOkfh(),
    checkPlatform(runtimePlatform),
    checkNode(),
    await checkExecutable("git", ["--version"], {
      id: "runtime-git",
      label: "git",
      missingMessage: "git executable was not found.",
      runtimePlatform,
      runExecutable,
    }),
  ];
  if (options.dev === true) {
    checks.push(
      await checkExecutable("pnpm", ["--version"], {
        id: "runtime-pnpm",
        label: "pnpm",
        missingMessage: "pnpm executable was not found.",
        outputPrefix: "pnpm ",
        runtimePlatform,
        runExecutable,
      }),
    );
  }

  checks.push(
    ...(await Promise.all(
      supportedBootstrapAgents.map((agent) => checkGlobalBootstrap(agent, readBootstrapStatus)),
    )),
  );

  const workspaceRoot = await resolveDoctorWorkspace(options, checks);
  if (workspaceRoot === null) {
    checks.push(
      skipCheck(
        "workspace-status",
        "Workspace status",
        "Workspace check skipped: no workspace was resolved.",
      ),
    );
    checks.push(
      skipCheck(
        "workspace-adapter-claude",
        "Claude Code adapter",
        "Workspace adapter check skipped: no workspace was resolved.",
      ),
    );
    checks.push(
      skipCheck(
        "workspace-adapter-codex",
        "Codex adapter",
        "Workspace adapter check skipped: no workspace was resolved.",
      ),
    );
  } else {
    checks.push(await checkWorkspaceStatus(workspaceRoot));
    checks.push(...(await checkSafetyPolicy(workspaceRoot)));
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
    id: "runtime-okfh",
    label: "okfh CLI",
    status: "pass",
    message: "Runtime check passed: the current okfh CLI entrypoint is running.",
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
    id: "runtime-platform",
    label: "Runtime platform",
    status: supported ? "pass" : "fail",
    message: supported
      ? `Runtime check passed: ${platformLabel} is supported by OKF Harness.`
      : `Runtime check failed: Node platform ${runtimePlatform} is not supported by OKF Harness.`,
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
      id: "runtime-node",
      label: "Node.js",
      status: "pass",
      message: `Runtime check passed: Node.js ${version} satisfies the >=22 runtime requirement.`,
      details: { version },
    };
  }

  return {
    id: "runtime-node",
    label: "Node.js",
    status: "fail",
    message: `Runtime check failed: Node.js ${version} does not satisfy the >=22 runtime requirement.`,
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
          ? `Runtime check passed: ${options.outputPrefix ?? ""}${output}`
          : `Runtime check passed: ${executable} is available.`,
      details: { executable },
    };
  } catch (error) {
    const code = nodeErrorCode(error);
    return {
      id: options.id,
      label: options.label,
      status: "fail",
      message:
        code === "ENOENT"
          ? `Runtime check failed: ${options.missingMessage}`
          : `Runtime check failed: ${executable} check failed.`,
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
  return runtimePlatform === "win32" && ["git", "npm", "pnpm"].includes(executable);
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
            ? "Workspace check warning: no okfh.config.yaml was found from the current directory or its parents."
            : "Workspace check failed: the requested workspace could not be resolved.",
        details: { startDir: error.startDir },
      });
      return null;
    }
    throw error;
  }
}

async function checkGlobalBootstrap(
  agent: BootstrapAgent,
  readBootstrapStatus: ReadBootstrapStatus,
): Promise<DoctorCheck> {
  let status: Awaited<ReturnType<ReadBootstrapStatus>>;
  try {
    status = await readBootstrapStatus({ agent });
  } catch (error) {
    return {
      id: `global-bootstrap-${agent}`,
      label: `${agent} global bootstrap`,
      status: "warn",
      message: `Global bootstrap check warning: ${agent} bootstrap status could not be read.`,
      details: {
        agent,
        error: error instanceof Error ? error.message : String(error),
        repairCommand: `okfh bootstrap repair --agents ${agent} --json`,
      },
    };
  }

  const label = `${status.detection.label} global bootstrap`;
  const details = {
    agent,
    detected: status.detection.detected,
    state: status.state,
    targetDirectory: status.targetDirectory,
    skillPath: status.skillPath,
    next: status.next,
  };

  if (status.state === "installed") {
    return {
      id: `global-bootstrap-${agent}`,
      label,
      status: "pass",
      message: `Global bootstrap check passed: ${status.detection.label} bootstrap skill is installed.`,
      details,
    };
  }

  if (!status.detection.detected) {
    return skipCheck(
      `global-bootstrap-${agent}`,
      label,
      `Global bootstrap check skipped: ${status.detection.label} was not detected.`,
      details,
    );
  }

  return {
    id: `global-bootstrap-${agent}`,
    label,
    status: "warn",
    message: `Global bootstrap check warning: ${status.detection.label} bootstrap status is ${status.state}.`,
    details: {
      ...details,
      reason: status.reason ?? null,
      blockedPath: status.blockedPath ?? null,
      conflictPath: status.conflictPath ?? null,
      repairCommand: `okfh bootstrap repair --agents ${agent} --json`,
    },
  };
}

async function checkWorkspaceStatus(workspaceRoot: string): Promise<DoctorCheck> {
  const status = await readWorkspaceStatus(workspaceRoot);
  if (!status.initialized) {
    return {
      id: "workspace-status",
      label: "Workspace status",
      status: "fail",
      message:
        "Workspace check failed: workspace is not initialized or okfh.config.yaml is invalid.",
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
      ? `Workspace check passed: ${status.name ?? workspaceRoot} is initialized and lint passes.`
      : `Workspace check warning: ${status.name ?? workspaceRoot} is initialized but lint has issues.`,
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

async function checkSafetyPolicy(workspaceRoot: string): Promise<DoctorCheck[]> {
  const status = await readWorkspaceStatus(workspaceRoot);
  const checkpointWarning = status.lint.issues.find(
    (issue) => issue.code === GIT_CHECKPOINT_POLICY_NOT_ENFORCED,
  );
  if (checkpointWarning === undefined) {
    return [];
  }

  return [
    {
      id: "workspace-safety-policy",
      label: "Safety policy",
      status: "warn",
      message: `Workspace check warning: ${checkpointWarning.message}`,
      details: {
        workspace: status.workspaceRoot,
        issueCode: checkpointWarning.code,
        path: checkpointWarning.path ?? null,
      },
    },
  ];
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
      id: `workspace-adapter-${adapter}`,
      label: adapter === "claude" ? "Claude Code adapter" : "Codex adapter",
      status: "pass",
      message: `Workspace adapter check passed: ${adapter === "claude" ? "Claude Code" : "Codex"} adapter files are installed.`,
      details: { rootGuidance, skillRoot },
    };
  }

  return {
    id: `workspace-adapter-${adapter}`,
    label: adapter === "claude" ? "Claude Code adapter" : "Codex adapter",
    status: "warn",
    message: `Workspace adapter check warning: ${adapter === "claude" ? "Claude Code" : "Codex"} adapter support is incomplete.`,
    details: {
      rootGuidance,
      skillRoot,
      hasManagedBlock,
      missingFiles,
      repairCommand: `okfh agent install ${adapter} --workspace <workspace> --json`,
    },
  };
}

function skipCheck(
  id: string,
  label: string,
  message: string,
  details?: Record<string, unknown>,
): DoctorCheck {
  return {
    id,
    label,
    status: "skip",
    message,
    ...(details === undefined ? {} : { details }),
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
