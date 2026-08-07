import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  type AgentAdapter,
  type BootstrapAgent,
  detectShadowingGlobalInstalls,
  findExecutable,
  type NativeIntegrationVerificationResult,
  nodeErrorCode,
  probeCommands,
  readBootstrapAgentStatus,
  renderAgentAdapter,
  shadowingGlobalInstallCleanupCommand,
  shouldUseWindowsShell,
  supportedBootstrapAgents,
  supportedNativeIntegrationProfiles,
  verifyNativeIntegration,
  windowsShellInvocation,
} from "@okf-harness/agent-pack";
import {
  harnessRuntimeVersion,
  readWorkspaceConfig,
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

export type DoctorCheckGroupId =
  | "runtime"
  | "nativeIntegrations"
  | "legacyBootstrapFallback"
  | "workspace";

export type DoctorCheckSummary = {
  pass: number;
  warn: number;
  fail: number;
  skip: number;
};

export type DoctorCheckGroup = {
  id: DoctorCheckGroupId;
  label: string;
  ok: boolean;
  checks: DoctorCheck[];
  summary: DoctorCheckSummary;
};

export type DoctorCheckGroups = {
  runtime: DoctorCheckGroup;
  nativeIntegrations: DoctorCheckGroup;
  legacyBootstrapFallback: DoctorCheckGroup;
  workspace: DoctorCheckGroup;
};

export type DoctorResult = {
  ok: boolean;
  workspace: string | null;
  checks: DoctorCheck[];
  groups: DoctorCheckGroups;
  summary: DoctorCheckSummary;
};

export type RunDoctorOptions = {
  workspaceRoot?: string | undefined;
  startDir?: string | undefined;
  dev?: boolean | undefined;
  runtimePlatform?: NodeJS.Platform | string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  runExecutable?: RunExecutable | undefined;
  readBootstrapStatus?: ReadBootstrapStatus | undefined;
};

export type RunExecutable = (
  executable: string,
  args: string[],
  options: {
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    shell?: boolean | undefined;
  },
) => Promise<{ stdout: string; stderr: string }>;

type ReadBootstrapStatus = typeof readBootstrapAgentStatus;

const execFileAsync = promisify(execFile);

export async function runDoctor(options: RunDoctorOptions = {}): Promise<DoctorResult> {
  const runtimePlatform = options.runtimePlatform ?? process.platform;
  const env = options.env ?? process.env;
  const runExecutable = options.runExecutable ?? runExecutableDefault;
  const readBootstrapStatus = options.readBootstrapStatus ?? readBootstrapAgentStatus;
  const runtimeChecks: DoctorCheck[] = [
    checkOkfh(),
    await checkShadowingGlobalInstalls(env, runtimePlatform, runExecutable),
    checkPlatform(runtimePlatform),
    checkNode(),
    await checkExecutable("git", ["--version"], {
      id: "runtime-recovery",
      label: "Workspace recovery",
      publicExecutableName: "workspace recovery",
      missingMessage: "workspace recovery dependency is unavailable.",
      runtimePlatform,
      runExecutable,
    }),
  ];
  if (options.dev === true) {
    runtimeChecks.push(
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

  const nativeIntegrationChecks = (
    await Promise.all(
      supportedNativeIntegrationProfiles.map((profile) =>
        checkNativeIntegration(profile, env, runtimePlatform, runExecutable),
      ),
    )
  ).flat();
  const legacyBootstrapFallbackChecks = await Promise.all(
    supportedBootstrapAgents.map((agent) => checkHostEntrypoint(agent, readBootstrapStatus)),
  );

  const workspaceChecks: DoctorCheck[] = [];
  const workspaceRoot = await resolveDoctorWorkspace(options, workspaceChecks);
  if (workspaceRoot === null) {
    workspaceChecks.push(
      skipCheck(
        "workspace-status",
        "Workspace status",
        "Workspace check skipped: no workspace was resolved.",
      ),
    );
    workspaceChecks.push(
      skipCheck(
        "workspace-runtime-pin",
        "Workspace runtime pin",
        "Workspace runtime pin check skipped: no workspace was resolved.",
      ),
    );
    workspaceChecks.push(
      skipCheck(
        "workspace-adapter-claude",
        "Claude Code adapter",
        "Workspace adapter check skipped: no workspace was resolved.",
      ),
    );
    workspaceChecks.push(
      skipCheck(
        "workspace-adapter-codex",
        "Codex adapter",
        "Workspace adapter check skipped: no workspace was resolved.",
      ),
    );
  } else {
    workspaceChecks.push(await checkWorkspaceStatus(workspaceRoot));
    workspaceChecks.push(await checkRuntimePin(workspaceRoot));
    workspaceChecks.push(await checkAdapter(workspaceRoot, "claude"));
    workspaceChecks.push(await checkAdapter(workspaceRoot, "codex"));
  }

  const groups: DoctorCheckGroups = {
    runtime: groupChecks("runtime", "Runtime", runtimeChecks),
    nativeIntegrations: groupChecks(
      "nativeIntegrations",
      "Native integrations",
      nativeIntegrationChecks,
    ),
    legacyBootstrapFallback: groupChecks(
      "legacyBootstrapFallback",
      "Legacy bootstrap fallback",
      legacyBootstrapFallbackChecks,
    ),
    workspace: groupChecks("workspace", "Workspace", workspaceChecks),
  };
  const checks = [
    ...runtimeChecks,
    ...nativeIntegrationChecks,
    ...legacyBootstrapFallbackChecks,
    ...workspaceChecks,
  ];
  const summary = summarizeChecks(checks);
  return {
    ok: summary.fail === 0,
    workspace: workspaceRoot,
    checks,
    groups,
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

async function checkShadowingGlobalInstalls(
  env: NodeJS.ProcessEnv,
  runtimePlatform: NodeJS.Platform | string,
  runExecutable: RunExecutable,
): Promise<DoctorCheck> {
  const installs = await detectShadowingGlobalInstalls({
    env,
    runCommand: runExecutable,
    runtimePlatform,
  });
  const clearingCommand = [
    shadowingGlobalInstallCleanupCommand.command,
    ...shadowingGlobalInstallCleanupCommand.args,
  ].join(" ");

  return {
    id: "runtime-shadowing-global",
    label: "Shadowing global runtime",
    status: installs.length === 0 ? "pass" : "warn",
    message:
      installs.length === 0
        ? "Shadowing global runtime check passed: no shadowing global install was detected."
        : `Shadowing global runtime check warning: ${installs.map((install) => install.label).join(" and ")} can write workspaces outside their runtime pins. Clear with ${clearingCommand}.`,
    details: { installs, clearingCommand },
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
    publicExecutableName?: string | undefined;
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
        options.publicExecutableName !== undefined
          ? `Runtime check passed: ${options.publicExecutableName} is available.`
          : output.length > 0
            ? `Runtime check passed: ${options.outputPrefix ?? ""}${output}`
            : `Runtime check passed: ${executable} is available.`,
      details: { executable: options.publicExecutableName ?? executable },
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
          : `Runtime check failed: ${options.publicExecutableName ?? executable} check failed.`,
      details:
        options.publicExecutableName === undefined
          ? {
              executable,
              error: error instanceof Error ? error.message : String(error),
            }
          : { executable: options.publicExecutableName },
    };
  }
}

async function runExecutableDefault(
  executable: string,
  args: string[],
  options: {
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    shell?: boolean | undefined;
  },
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(executable, args, {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell === true,
    windowsHide: true,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
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

async function checkHostEntrypoint(
  agent: BootstrapAgent,
  readBootstrapStatus: ReadBootstrapStatus,
): Promise<DoctorCheck> {
  let status: Awaited<ReturnType<ReadBootstrapStatus>>;
  try {
    status = await readBootstrapStatus({ agent });
  } catch (error) {
    return {
      id: `global-bootstrap-${agent}`,
      label: `${agent} host entrypoint`,
      status: "warn",
      message: `Host entrypoint check warning: ${agent} status could not be read.`,
      details: {
        agent,
        error: error instanceof Error ? error.message : String(error),
        repairCommand: `okfh bootstrap repair --agents ${agent} --json`,
      },
    };
  }

  const label = `${status.detection.label} host entrypoint`;
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
      message: `Host entrypoint check passed: ${status.detection.label} has the unified skill installed.`,
      details,
    };
  }

  if (!status.detection.detected) {
    return skipCheck(
      `global-bootstrap-${agent}`,
      label,
      `Host entrypoint check skipped: ${status.detection.label} was not detected.`,
      details,
    );
  }

  return {
    id: `global-bootstrap-${agent}`,
    label,
    status: "warn",
    message: `Host entrypoint check warning: ${status.detection.label} status is ${status.state}.`,
    details: {
      ...details,
      reason: status.reason ?? null,
      blockedPath: status.blockedPath ?? null,
      conflictPath: status.conflictPath ?? null,
      repairCommand: `okfh bootstrap repair --agents ${agent} --json`,
    },
  };
}

async function checkNativeIntegration(
  profile: (typeof supportedNativeIntegrationProfiles)[number],
  env: NodeJS.ProcessEnv,
  runtimePlatform: NodeJS.Platform | string,
  runExecutable: RunExecutable,
): Promise<DoctorCheck[]> {
  const executablePath = await findExecutable(profile.command, env);
  const hostDetails = {
    agent: profile.id,
    command: profile.command,
    installCommand: `npx @okf-harness/setup@latest --agents ${profile.id}`,
    verifiesIntegrationInstall: false,
  };
  if (executablePath === undefined) {
    return [
      skipCheck(
        `native-host-cli-${profile.id}`,
        `${profile.label} host CLI`,
        `Native host check skipped: ${profile.label} CLI was not detected.`,
        hostDetails,
      ),
      skipCheck(
        `native-integration-${profile.id}`,
        `${profile.label} native integration`,
        `Native integration verification skipped: ${profile.label} CLI was not detected.`,
        nativeVerificationDetails(profile, {
          outcome: "unavailable",
          reason: "probe-command-unavailable",
          expectedIdentity: profile.verification.expectedIdentity,
        }),
      ),
    ];
  }

  const hostCheck: DoctorCheck = {
    id: `native-host-cli-${profile.id}`,
    label: `${profile.label} host CLI`,
    status: "pass",
    message: `Native host check passed: ${profile.label} CLI was detected.`,
    details: { ...hostDetails, executablePath },
  };
  const probeResults = await probeCommands(profile.verification.commands, runExecutable, {
    env,
    invocation: (command) => windowsShellInvocation(command, executablePath, runtimePlatform),
  });
  const result = verifyNativeIntegration(profile.verification, probeResults);
  return [hostCheck, nativeVerificationCheck(profile, result)];
}

function nativeVerificationCheck(
  profile: (typeof supportedNativeIntegrationProfiles)[number],
  result: NativeIntegrationVerificationResult,
): DoctorCheck {
  const installCommand = `npx @okf-harness/setup@latest --agents ${profile.id} --yes`;
  const message =
    result.outcome === "verified"
      ? `Native integration verification passed: ${profile.label} recognizes the expected OKF Harness integration.`
      : result.outcome === "unavailable"
        ? `Native integration verification warning: ${profile.label} probe is unavailable (${result.reason}). Update ${profile.label} and retry doctor; the listed probe must be supported.`
        : `Native integration verification warning: ${profile.label} did not verify the expected integration (${result.reason}). Run ${installCommand}, then retry doctor.`;
  return {
    id: `native-integration-${profile.id}`,
    label: `${profile.label} native integration`,
    status: result.outcome === "verified" ? "pass" : "warn",
    message,
    details: nativeVerificationDetails(profile, result),
  };
}

function nativeVerificationDetails(
  profile: (typeof supportedNativeIntegrationProfiles)[number],
  result: NativeIntegrationVerificationResult,
): Record<string, unknown> {
  return {
    agent: profile.id,
    probeCommand: profile.verification.commands
      .map((command) => [command.command, ...command.args].join(" "))
      .join(" && "),
    outcome: result.outcome,
    reason: result.reason,
    expectedIdentity: result.expectedIdentity,
    ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }),
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

/**
 * Reports which Harness runtime may write this workspace. A missing pin is a
 * one-shot recordable state, so it never fails the run.
 */
async function checkRuntimePin(workspaceRoot: string): Promise<DoctorCheck> {
  const config = await readWorkspaceConfig(workspaceRoot);
  if (!config.ok) {
    return {
      id: "workspace-runtime-pin",
      label: "Workspace runtime pin",
      status: "warn",
      message: "Workspace runtime pin check warning: okfh.config.yaml could not be read.",
      details: { workspace: workspaceRoot, issues: config.issues },
    };
  }

  const pinnedVersion = config.config.runtime?.version;
  if (pinnedVersion === undefined) {
    return {
      id: "workspace-runtime-pin",
      label: "Workspace runtime pin",
      status: "warn",
      message: "Workspace runtime pin check warning: this workspace records no runtime pin.",
      details: {
        workspace: workspaceRoot,
        pinnedVersion: null,
        adoptCommand: {
          command: "npx",
          args: [
            "--yes",
            "--package",
            `@okf-harness/cli@${harnessRuntimeVersion}`,
            "okfh",
            "adopt-runtime",
            "--workspace",
            workspaceRoot,
            "--json",
          ],
        },
      },
    };
  }

  return {
    id: "workspace-runtime-pin",
    label: "Workspace runtime pin",
    status: "pass",
    message: `Workspace runtime pin check passed: this workspace is pinned to Harness runtime ${pinnedVersion}.`,
    details: { workspace: workspaceRoot, pinnedVersion },
  };
}

async function checkAdapter(workspaceRoot: string, adapter: AgentAdapter): Promise<DoctorCheck> {
  const rendered = renderAgentAdapter({ adapter });
  const rootGuidance = rendered.rootGuidancePath;
  const skillRoot = rendered.skillRoot;
  const missingFiles: string[] = [];
  const rootContents = await readOptionalText(path.join(workspaceRoot, rootGuidance));

  for (const file of rendered.files) {
    if (!(await fileExists(path.join(workspaceRoot, file.path)))) {
      missingFiles.push(file.path);
    }
  }

  const hasManagedBlock =
    rootContents?.includes(rendered.managedBlockStart) === true &&
    rootContents.includes(rendered.managedBlockEnd);
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

function groupChecks(
  id: DoctorCheckGroupId,
  label: string,
  checks: DoctorCheck[],
): DoctorCheckGroup {
  const summary = summarizeChecks(checks);
  return {
    id,
    label,
    ok: summary.fail === 0,
    checks,
    summary,
  };
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
