import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import {
  commandErrorDetails,
  commandExitCode,
  commandStderr,
  commandStdout,
  type DetectedShadowingGlobalInstall,
  detectShadowingGlobalInstalls,
  findExecutable,
  type NativeInstallCommand,
  type NativeIntegrationId,
  type NativeIntegrationProfile,
  type NativeIntegrationVerificationResult,
  nativeIntegrationProfile,
  type ProbeRunner,
  probeCommands,
  shadowingGlobalInstallCleanupCommand,
  shouldUseWindowsShell,
  supportedNativeIntegrationProfiles,
  verifyNativeIntegration,
  windowsShellInvocation,
} from "@okf-harness/agent-pack";
import {
  type ConfigIssue,
  readWorkspaceConfig,
  resolveWorkspaceRoot,
  WorkspaceResolutionError,
} from "@okf-harness/core";

export const packageInfo = {
  name: "@okf-harness/setup",
  role: "setup",
} as const;

export type PackageInfo = typeof packageInfo;

export type SetupAgentId = NativeIntegrationId;

export type SetupIo = {
  writeOut: (chunk: string) => void;
  writeErr: (chunk: string) => void;
  readLine?: (prompt: string) => Promise<string>;
};

export type SetupCommandResult = {
  stdout: string;
  stderr: string;
  exitCode?: number;
};

export type RunSetupCommand = (
  command: string,
  args: string[],
  options: { cwd?: string | undefined; env: NodeJS.ProcessEnv; shell?: boolean | undefined },
) => Promise<SetupCommandResult>;

export type SetupNativeInstallCommand = NativeInstallCommand;

export type SetupShadowingInstallPlan = DetectedShadowingGlobalInstall;

export type RunSetupOptions = {
  env?: NodeJS.ProcessEnv;
  nodeVersion?: string;
  runtimePlatform?: NodeJS.Platform | string;
  runCommand?: RunSetupCommand;
};

export type RuntimeInvocation = {
  command: "npx";
  args: string[];
};

export type RuntimeLauncherOutcome =
  | {
      code: "DELEGATED";
      workspaceRoot: string;
      invocation: RuntimeInvocation;
    }
  | {
      code: "RUNTIME_PIN_MISSING";
      workspaceRoot: string;
      adoptCommand: RuntimeInvocation;
    }
  | {
      code: "CONFIG_INVALID";
      workspaceRoot: string;
      issues: ConfigIssue[];
    }
  | {
      code: "WORKSPACE_NOT_FOUND";
      startDir: string;
    }
  | {
      code: "RUNTIME_EXECUTION_FAILED";
      workspaceRoot: string;
      invocation: RuntimeInvocation;
    };

export type SetupRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  outcome?: RuntimeLauncherOutcome;
};

type RuntimeLauncherArgs = {
  workspaceRoot?: string;
  runtimeArgs: string[];
};

type RuntimeLauncherOptions = {
  env: NodeJS.ProcessEnv;
  runCommand: RunSetupCommand;
  writeErr: (chunk: string) => void;
  writeOut: (chunk: string) => void;
};

type SetupArgs = {
  cleanupOnly: boolean;
  dryRun: boolean;
  verifyRemote: boolean;
  yes: boolean;
  selection: AgentSelection;
};

type ParsedCommandArgs =
  | { kind: "launch"; args: RuntimeLauncherArgs }
  | { kind: "setup"; args: SetupArgs }
  | { error: string };

type AgentSelection =
  | { kind: "default" }
  | { kind: "auto" }
  | { kind: "explicit"; agents: Set<SetupAgentId> };

type SetupAgentProfile = NativeIntegrationProfile;

export type SetupAgentPlan = {
  id: SetupAgentId;
  label: string;
  supportLevel: "native-supported";
  detected: boolean;
  selected: boolean;
  optIn: boolean;
  command: string;
  nativeInstall: string;
  nativeInstallCommands: readonly SetupNativeInstallCommand[];
  verificationCommands: readonly SetupNativeInstallCommand[];
  expectedIdentity: string;
  installLaterCommand: string;
  executablePath?: string;
};

export type SetupPlan = {
  setupVersion: string;
  nodeVersion: string;
  cleanupOnly: boolean;
  dryRun: boolean;
  verifyRemote: boolean;
  yes: boolean;
  warnings: string[];
  shadowingInstalls: SetupShadowingInstallPlan[];
  agents: SetupAgentPlan[];
};

const execFileAsync = promisify(execFile);
const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const runtimePackageName = "@okf-harness/cli";
const runtimeStartMarker = "\u001eOKFH_RUNTIME_STARTED\u001e";
const runtimeWrapperSource = `
const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const packageSpec = process.argv[1];
const runtimeArgs = process.argv.slice(2);
let runtimeBin;
for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
  const packageRoot = path.resolve(directory, "..", "@okf-harness", "cli");
  const manifestPath = path.join(packageRoot, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name + "@" + manifest.version !== packageSpec) continue;
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.okfh;
  if (typeof bin !== "string") continue;
  const candidate = path.resolve(packageRoot, bin);
  if (existsSync(candidate)) {
    runtimeBin = candidate;
    break;
  }
}
if (runtimeBin === undefined) {
  process.stderr.write("Could not resolve the pinned okfh runtime.\\n");
  process.exit(1);
}
const child = spawn(process.execPath, [runtimeBin, ...runtimeArgs], {
  env: process.env,
  stdio: "inherit",
});
child.on("spawn", () => {
  process.stderr.write(${JSON.stringify(runtimeStartMarker)});
});
child.on("error", (error) => {
  process.stderr.write(String(error) + "\\n");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
`;

const invalidAgentsMessage =
  "Setup agents must be: auto, claude, codex, opencode, pi, hermes, openclaw.";

const setupAgentProfiles: readonly SetupAgentProfile[] = supportedNativeIntegrationProfiles;

export async function runSetup(
  argv: string[] = process.argv,
  io: SetupIo = {
    writeOut: (chunk) => process.stdout.write(chunk),
    writeErr: (chunk) => process.stderr.write(chunk),
    readLine: async (prompt) => {
      const readline = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await readline.question(prompt);
      } finally {
        readline.close();
      }
    },
  },
  options: RunSetupOptions = {},
): Promise<SetupRunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writeOut = (chunk: string): void => {
    stdout.push(chunk);
    io.writeOut(chunk);
  };
  const writeErr = (chunk: string): void => {
    stderr.push(chunk);
    io.writeErr(chunk);
  };

  const parsed = parseCommandArgs(argv.slice(2));
  if ("error" in parsed) {
    writeErr(`${parsed.error}\n`);
    return { exitCode: 1, stdout: stdout.join(""), stderr: stderr.join("") };
  }

  const env = options.env ?? process.env;
  const runtimePlatform = options.runtimePlatform ?? process.platform;
  const nodeVersion = options.nodeVersion ?? process.version;
  const nodeMajor = parseNodeMajorVersion(nodeVersion);
  if (nodeMajor === undefined || nodeMajor < 22) {
    writeErr(
      "OKF Harness setup requires Node.js 22 or newer. Download Node.js from https://nodejs.org.\n",
    );
    return { exitCode: 1, stdout: stdout.join(""), stderr: stderr.join("") };
  }

  if (parsed.kind === "launch") {
    const runCommand =
      options.runCommand ??
      ((command: string, args: string[], commandOptions: Parameters<RunSetupCommand>[2]) =>
        runRuntimeLauncherCommandDefault(command, args, commandOptions, runtimePlatform));
    return launchRuntime(parsed.args, { env, runCommand, writeErr, writeOut });
  }

  const runCommand = options.runCommand ?? runCommandDefault;
  const setupArgs = parsed.args;
  const plan = await createSetupPlan({
    ...setupArgs,
    env,
    nodeVersion,
    runCommand,
    runtimePlatform,
  });
  writeOut(renderSetupPlan(plan));

  let exitCode = 0;
  if (!setupArgs.dryRun) {
    exitCode = await clearShadowingGlobalInstalls({
      env,
      io: { ...io, writeOut, writeErr },
      parsed: setupArgs,
      plan,
      runCommand,
      runtimePlatform,
    });

    const nativeInstallExitCode = await installSelectedNativeIntegrations({
      env,
      io: { ...io, writeOut, writeErr },
      parsed: setupArgs,
      plan,
      runCommand,
      runtimePlatform,
    });
    exitCode = Math.max(exitCode, nativeInstallExitCode);
  }

  return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

async function launchRuntime(
  parsed: RuntimeLauncherArgs,
  options: RuntimeLauncherOptions,
): Promise<SetupRunResult> {
  let workspaceRoot: string;
  try {
    workspaceRoot = await resolveWorkspaceRoot({
      workspaceRoot: parsed.workspaceRoot,
      startDir: options.env.PWD,
    });
  } catch (error) {
    const startDir =
      error instanceof WorkspaceResolutionError
        ? error.startDir
        : path.resolve(parsed.workspaceRoot ?? options.env.PWD ?? process.cwd());
    const outcome = { code: "WORKSPACE_NOT_FOUND", startDir } as const;
    return runtimeLauncherFailure(options.writeErr, outcome, {
      workspace: null,
      message: error instanceof Error ? error.message : "Workspace resolution failed.",
      data: { startDir },
      next: ["Run from inside an OKF Harness workspace or pass --workspace <path>."],
    });
  }

  try {
    await access(path.join(workspaceRoot, "okfh.config.yaml"));
  } catch (error) {
    if (isMissingPathError(error)) {
      const outcome = { code: "WORKSPACE_NOT_FOUND", startDir: workspaceRoot } as const;
      return runtimeLauncherFailure(options.writeErr, outcome, {
        workspace: null,
        message: "Could not find okfh.config.yaml in the requested workspace.",
        data: { startDir: workspaceRoot },
        next: ["Run from inside an OKF Harness workspace or pass --workspace <path>."],
      });
    }
  }

  const config = await readWorkspaceConfig(workspaceRoot);
  if (!config.ok) {
    const outcome = {
      code: "CONFIG_INVALID",
      workspaceRoot,
      issues: config.issues,
    } as const;
    return runtimeLauncherFailure(options.writeErr, outcome, {
      workspace: workspaceRoot,
      message: "Workspace config is invalid.",
      data: { issues: config.issues },
    });
  }
  if (config.config.runtime === undefined) {
    const adoptCommand: RuntimeInvocation = {
      command: "npx",
      args: [
        "--yes",
        "--package",
        `${runtimePackageName}@${packageVersion.version}`,
        "okfh",
        "adopt-runtime",
        "--workspace",
        workspaceRoot,
        "--json",
      ],
    };
    const outcome = {
      code: "RUNTIME_PIN_MISSING",
      workspaceRoot,
      adoptCommand,
    } as const;
    return runtimeLauncherFailure(options.writeErr, outcome, {
      workspace: workspaceRoot,
      message: "Workspace runtime pin is missing.",
      data: { adoptCommand },
      next: ["Run data.adoptCommand, then retry launch."],
    });
  }

  return delegateRuntime(
    workspaceRoot,
    {
      command: "npx",
      args: [
        "--loglevel=silent",
        "--yes",
        "--package",
        `${runtimePackageName}@${config.config.runtime.version}`,
        "okfh",
        ...parsed.runtimeArgs,
      ],
    },
    options,
  );
}

async function delegateRuntime(
  workspaceRoot: string,
  invocation: RuntimeInvocation,
  options: RuntimeLauncherOptions,
): Promise<SetupRunResult> {
  let result: SetupCommandResult;
  try {
    result = await options.runCommand(invocation.command, invocation.args, {
      cwd: workspaceRoot,
      env: options.env,
      shell: false,
    });
  } catch (error) {
    const exitCode = commandExitCode(error);
    if (exitCode === undefined || !runtimeDidStart(error)) {
      const outcome = {
        code: "RUNTIME_EXECUTION_FAILED",
        workspaceRoot,
        invocation,
      } as const;
      return runtimeLauncherFailure(options.writeErr, outcome, {
        workspace: workspaceRoot,
        message: "Pinned runtime could not be fetched or executed.",
        data: { attemptedInvocation: invocation },
        details: { cause: commandErrorDetails(error) },
        ...(exitCode === undefined ? {} : { exitCode }),
      });
    }
    result = { exitCode, stdout: commandStdout(error), stderr: commandStderr(error) };
  }

  options.writeOut(result.stdout);
  options.writeErr(result.stderr);
  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout,
    stderr: result.stderr,
    outcome: { code: "DELEGATED", workspaceRoot, invocation },
  };
}

function runtimeLauncherFailure(
  writeErr: (chunk: string) => void,
  outcome: Exclude<RuntimeLauncherOutcome, { code: "DELEGATED" }>,
  options: {
    workspace: string | null;
    message: string;
    data?: Record<string, unknown>;
    details?: Record<string, unknown>;
    exitCode?: number;
    next?: string[];
  },
): SetupRunResult {
  const envelope = {
    ok: false,
    command: "launch",
    workspace: options.workspace,
    data: { outcome: outcome.code, ...options.data },
    warnings: [],
    error: {
      code: outcome.code,
      message: options.message,
      ...(options.details === undefined ? {} : { details: options.details }),
    },
    next: options.next ?? [],
  };
  const stderr = `${JSON.stringify(envelope)}\n`;
  writeErr(stderr);
  return { exitCode: options.exitCode ?? 1, stdout: "", stderr, outcome };
}

async function createSetupPlan(
  options: SetupArgs & {
    env: NodeJS.ProcessEnv;
    nodeVersion: string;
    runCommand: RunSetupCommand;
    runtimePlatform: NodeJS.Platform | string;
  },
): Promise<SetupPlan> {
  const agents = await Promise.all(
    setupAgentProfiles.map(async (profile): Promise<SetupAgentPlan> => {
      const executablePath = await findExecutable(profile.command, options.env);
      const detected = executablePath !== undefined;
      const selected = isSelected(profile, detected, options.cleanupOnly, options.selection);
      return {
        id: profile.id,
        label: profile.label,
        supportLevel: profile.supportLevel,
        detected,
        selected,
        optIn: !profile.defaultSelected,
        command: profile.command,
        nativeInstall: profile.nativeInstall,
        nativeInstallCommands: profile.nativeInstallCommands,
        verificationCommands: profile.verification.commands,
        expectedIdentity: profile.verification.expectedIdentity,
        installLaterCommand: `npx @okf-harness/setup@latest --agents ${profile.id}`,
        ...(executablePath === undefined ? {} : { executablePath }),
      };
    }),
  );
  const [recoverySupport, shadowingInstalls] = await Promise.all([
    findExecutable("git", options.env),
    detectShadowingGlobalInstalls({
      ...options,
      runCommand: runProbe(options.runCommand, options.env),
    }),
  ]);
  return {
    setupVersion: packageVersion.version,
    nodeVersion: options.nodeVersion,
    cleanupOnly: options.cleanupOnly,
    dryRun: options.dryRun,
    verifyRemote: options.verifyRemote,
    yes: options.yes,
    warnings:
      recoverySupport === undefined
        ? [
            "Warning: workspace recovery dependency is unavailable, but native integration planning can continue.",
          ]
        : [],
    shadowingInstalls,
    agents,
  };
}

export function renderSetupPlan(plan: SetupPlan): string {
  const lines = [
    "OKF Harness Setup plan",
    `Resolved setup version: ${plan.setupVersion}`,
    `Node.js: ${plan.nodeVersion} (meets >=22)`,
    plan.dryRun
      ? "Dry run: no network checks or filesystem writes."
      : "Plan: no filesystem writes until installation is confirmed.",
    plan.verifyRemote
      ? "Remote checks: requested with --verify-remote; reserved for explicit availability checks and not implied by dry-run."
      : "Remote checks: not requested.",
    "",
    "Removals",
  ];

  if (plan.shadowingInstalls.length === 0) {
    lines.push("- None");
  } else {
    for (const install of plan.shadowingInstalls) {
      const detectedAt =
        install.id === "runtime"
          ? install.executablePath
          : `${install.packageName}${install.version === undefined ? "" : `@${install.version}`}`;
      lines.push(`- Remove ${install.label}: ${detectedAt}`);
    }
    lines.push(`  Clearing command: ${commandToString(shadowingGlobalInstallCleanupCommand)}`);
  }

  if (plan.cleanupOnly) {
    lines.push("", "Cleanup only: agent integrations are not selected.");
  }

  if (plan.warnings.length > 0) {
    lines.push("", "Warnings", ...plan.warnings.map((warning) => `- ${warning}`));
  }

  const detected = plan.agents.filter((agent) => agent.detected);
  lines.push("", "Detected install choices");
  if (detected.length === 0) {
    lines.push("- None");
  } else {
    for (const agent of detected) {
      const checkbox = agent.selected ? "[x]" : "[ ]";
      const state = agent.selected ? "selected" : agent.optIn ? "opt-in" : "available";
      lines.push(`${checkbox} ${agent.label} - ${agent.supportLevel} - detected - ${state}`);
      lines.push("  Native install commands:");
      for (const command of agent.nativeInstallCommands) {
        lines.push(`  - ${commandToString(command)}`);
      }
      lines.push("  Verification commands:");
      for (const command of agent.verificationCommands) {
        lines.push(`  - ${commandToString(command)}`);
      }
      lines.push(`  Expected identity: ${agent.expectedIdentity}`);
      if (agent.id === "openclaw") {
        lines.push("  Safety note: OpenClaw requires explicit opt-in before installation.");
      }
    }
  }

  const undetected = plan.agents.filter((agent) => !agent.detected);
  lines.push("", "Install later");
  if (undetected.length === 0) {
    lines.push("- None");
  } else {
    for (const agent of undetected) {
      lines.push(`${agent.label}: ${agent.installLaterCommand}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function runProbe(runCommand: RunSetupCommand, env: NodeJS.ProcessEnv): ProbeRunner {
  return (command, args, options) =>
    runCommand(command, args, {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env,
      shell: options.shell,
    });
}

async function clearShadowingGlobalInstalls(options: {
  env: NodeJS.ProcessEnv;
  io: Required<Pick<SetupIo, "writeOut" | "writeErr">> & Pick<SetupIo, "readLine">;
  parsed: SetupArgs;
  plan: SetupPlan;
  runCommand: RunSetupCommand;
  runtimePlatform: NodeJS.Platform | string;
}): Promise<number> {
  if (options.plan.shadowingInstalls.length === 0) {
    return 0;
  }

  const shouldRemove =
    options.parsed.yes ||
    (await confirmYes(options.io, "Remove shadowing global installs? [Y/n] "));
  if (!shouldRemove) {
    options.io.writeOut("Shadowing global install removal skipped.\n");
    writeRemainingShadowingInstalls(options.io.writeOut, options.plan.shadowingInstalls);
    return 0;
  }

  const command = shadowingGlobalInstallCleanupCommand;
  options.io.writeOut(`Removing shadowing global installs: ${commandToString(command)}\n`);
  let exitCode = 0;
  try {
    await options.runCommand(command.command, command.args, {
      env: options.env,
      shell: shouldUseWindowsShell(options.runtimePlatform, command.command),
    });
  } catch (error) {
    exitCode = 1;
    writeRuntimeCommandFailure(
      options.io.writeErr,
      "Shadowing global install removal failed",
      command,
      error,
    );
  }

  const remaining = await detectShadowingGlobalInstalls({
    ...options,
    runCommand: runProbe(options.runCommand, options.env),
  });
  if (remaining.length === 0) {
    options.io.writeOut("Shadowing global install cleanup verified.\n");
  } else {
    writeRemainingShadowingInstalls(options.io.writeOut, remaining);
    exitCode = 1;
  }
  return exitCode;
}

function writeRemainingShadowingInstalls(
  writeOut: (chunk: string) => void,
  installs: SetupShadowingInstallPlan[],
): void {
  writeOut("Shadowing global installs remaining:\n");
  for (const install of installs) {
    writeOut(`- ${install.label}\n`);
  }
  writeOut(`Clear with: ${commandToString(shadowingGlobalInstallCleanupCommand)}\n`);
}

type NativeInstallFailure = {
  agent: SetupAgentPlan;
  command: SetupNativeInstallCommand;
  completedCommands: SetupNativeInstallCommand[];
};

type NativeVerificationReport = {
  agent: SetupAgentPlan;
  result: NativeIntegrationVerificationResult;
};

async function installSelectedNativeIntegrations(options: {
  env: NodeJS.ProcessEnv;
  io: Required<Pick<SetupIo, "writeOut" | "writeErr">> & Pick<SetupIo, "readLine">;
  parsed: SetupArgs;
  plan: SetupPlan;
  runCommand: RunSetupCommand;
  runtimePlatform: NodeJS.Platform | string;
}): Promise<number> {
  const agents = options.plan.agents.filter((agent) => agent.selected);
  if (agents.length === 0) {
    return 0;
  }

  if (!options.parsed.yes && agents.some((agent) => agent.id === "openclaw")) {
    options.io.writeOut(
      "OpenClaw safety note: install only native skills you trust; review them before enabling.\n",
    );
  }

  const shouldInstall =
    options.parsed.yes ||
    (await confirmYes(options.io, "Install selected native integrations? [Y/n] "));
  if (!shouldInstall) {
    options.io.writeOut("Native integration installation skipped.\n");
    return 0;
  }

  const completedAgents: SetupAgentPlan[] = [];
  const failures: NativeInstallFailure[] = [];
  const verifications: NativeVerificationReport[] = [];
  for (const agent of agents) {
    let failed = false;
    const completedCommands: SetupNativeInstallCommand[] = [];
    for (const installCommand of agent.nativeInstallCommands) {
      options.io.writeOut(`Installing ${agent.label}: ${commandToString(installCommand)}\n`);
      const invocation = windowsShellInvocation(
        installCommand.command,
        agent.executablePath,
        options.runtimePlatform,
      );
      try {
        const result = await options.runCommand(invocation.command, installCommand.args, {
          ...(invocation.cwd === undefined ? {} : { cwd: invocation.cwd }),
          env: options.env,
          shell: invocation.shell,
        });
        const exitCode = result.exitCode ?? 0;
        if (exitCode !== 0) {
          failed = true;
          failures.push({ agent, command: installCommand, completedCommands });
          writeNativeInstallCommandFailure(options.io.writeErr, agent, installCommand, exitCode);
          break;
        }
        completedCommands.push(installCommand);
      } catch (error) {
        failed = true;
        failures.push({ agent, command: installCommand, completedCommands });
        writeNativeInstallCommandFailure(
          options.io.writeErr,
          agent,
          installCommand,
          commandExitCode(error),
        );
        break;
      }
    }
    if (!failed) {
      completedAgents.push(agent);
    }
    verifications.push({
      agent,
      result: await runNativeIntegrationVerification(agent, options),
    });
  }

  writeNativeInstallSummary(options.io.writeOut, completedAgents, failures, verifications);
  return verifications.every(({ result }) => result.outcome === "verified") ? 0 : 1;
}

async function runNativeIntegrationVerification(
  agent: SetupAgentPlan,
  options: Pick<
    Parameters<typeof installSelectedNativeIntegrations>[0],
    "env" | "io" | "runCommand" | "runtimePlatform"
  >,
): Promise<NativeIntegrationVerificationResult> {
  const definition = nativeIntegrationProfile(agent.id).verification;
  const probeResults = await probeCommands(
    definition.commands,
    runProbe(options.runCommand, options.env),
    {
      env: options.env,
      invocation: (command) =>
        windowsShellInvocation(command, agent.executablePath, options.runtimePlatform),
      onProbe: (probeCommand) => {
        options.io.writeOut(`Verifying ${agent.label}: ${commandToString(probeCommand)}\n`);
      },
    },
  );
  return verifyNativeIntegration(definition, probeResults);
}

function writeNativeInstallCommandFailure(
  writeErr: (chunk: string) => void,
  agent: SetupAgentPlan,
  command: SetupNativeInstallCommand,
  exitCode: number | undefined,
): void {
  writeErr(`Native install warning: ${agent.label}\n`);
  writeErr(`Command: ${commandToString(command)}\n`);
  writeErr("Reason: install-command-failed\n");
  if (exitCode !== undefined) {
    writeErr(`Exit code: ${exitCode}\n`);
  }
}

function writeNativeInstallSummary(
  writeOut: (chunk: string) => void,
  completedAgents: SetupAgentPlan[],
  failures: NativeInstallFailure[],
  verifications: NativeVerificationReport[],
): void {
  writeOut("Install results\n");
  writeOut(
    `Install commands completed without errors: ${
      completedAgents.length === 0 ? "None" : completedAgents.map((agent) => agent.label).join(", ")
    }\n`,
  );
  if (failures.length === 0) {
    writeOut("Install command warnings: None\n");
  } else {
    writeOut("Install command warnings:\n");
    for (const failure of failures) {
      writeOut(`- ${failure.agent.label} failed at ${commandToString(failure.command)}\n`);
      if (failure.completedCommands.length > 0) {
        writeOut("  Completed before failure:\n");
        for (const command of failure.completedCommands) {
          writeOut(`  - ${commandToString(command)}\n`);
        }
      }
      writeOut("  Retry from failed command:\n");
      for (const command of failure.agent.nativeInstallCommands.slice(
        failure.completedCommands.length,
      )) {
        writeOut(`  - ${commandToString(command)}\n`);
      }
    }
  }

  writeOut("Native integration verification\n");
  for (const { agent, result } of verifications) {
    writeOut(`- ${agent.label}: ${result.outcome}\n`);
    for (const command of agent.verificationCommands) {
      writeOut(`  Probe: ${commandToString(command)}\n`);
    }
    writeOut(`  Reason: ${result.reason}\n`);
    writeOut(`  Expected identity: ${result.expectedIdentity}\n`);
    if (result.exitCode !== undefined) {
      writeOut(`  Exit code: ${result.exitCode}\n`);
    }
    if (result.outcome === "unavailable") {
      writeOut(
        `  Next: Update ${agent.label} and retry setup; the listed probe must be supported.\n`,
      );
    } else if (result.outcome === "failed") {
      writeOut("  Next: Retry the listed native install commands, then rerun setup.\n");
    }
  }
}

async function confirmYes(io: SetupIo, prompt: string): Promise<boolean> {
  if (io.readLine === undefined) {
    return false;
  }
  const answer = (await io.readLine(prompt)).trim().toLowerCase();
  return answer === "" || answer === "y" || answer === "yes";
}

function writeRuntimeCommandFailure(
  writeErr: (chunk: string) => void,
  label: string,
  command: { command: string; args: string[] },
  error: unknown,
): void {
  writeErr(`${label}: ${commandToString(command)}\n`);
  const details = commandErrorDetails(error);
  if (details.length > 0) {
    writeErr(`Details: ${details}\n`);
  }
  if (isPermissionError(error)) {
    writeErr(
      `Next: Use a user-writable npm global prefix, then run ${commandToString(command)} yourself.\n`,
    );
  }
}

function commandToString(command: { command: string; args: string[] }): string {
  return [command.command, ...command.args].join(" ");
}

function runtimeDidStart(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "runtimeStarted" in error &&
    error.runtimeStarted === true
  );
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function isPermissionError(error: unknown): boolean {
  const details = commandErrorDetails(error).toLowerCase();
  return (
    details.includes("eacces") || details.includes("eperm") || details.includes("permission denied")
  );
}

async function runRuntimeLauncherCommandDefault(
  command: string,
  args: string[],
  options: Parameters<RunSetupCommand>[2],
  runtimePlatform: NodeJS.Platform | string,
): Promise<SetupCommandResult> {
  if (command !== "npx") {
    return runCommandDefault(command, args, { ...options, shell: false });
  }

  const runtimeCommandIndex = args.indexOf("okfh");
  const packageOptionIndex = args.indexOf("--package");
  const packageSpec = args[packageOptionIndex + 1];
  if (runtimeCommandIndex === -1 || packageOptionIndex === -1 || packageSpec === undefined) {
    throw new Error("Pinned runtime invocation is incomplete.");
  }
  const wrappedArgs = [
    ...args.slice(0, runtimeCommandIndex),
    "--",
    "node",
    "-e",
    runtimeWrapperSource,
    packageSpec,
    ...args.slice(runtimeCommandIndex + 1),
  ];

  let executable = command;
  let executionArgs = wrappedArgs;
  if (runtimePlatform === "win32") {
    const npx = await findExecutable(command, options.env);
    if (npx === undefined) {
      throw new Error("Could not find npx on PATH.");
    }
    const npxCli = path.join(path.dirname(npx), "node_modules", "npm", "bin", "npx-cli.js");
    try {
      await access(npxCli);
    } catch {
      throw new Error(`Could not resolve the npx CLI from ${npx}.`);
    }
    executable = process.execPath;
    executionArgs = [npxCli, ...wrappedArgs];
  }

  try {
    const result = await runCommandDefault(executable, executionArgs, {
      ...options,
      shell: false,
    });
    const markerIndex = result.stderr.indexOf(runtimeStartMarker);
    if (markerIndex === -1) {
      throw new Error("Pinned runtime did not start.");
    }
    return {
      ...result,
      stderr: result.stderr.slice(markerIndex + runtimeStartMarker.length),
    };
  } catch (error) {
    const stderr = commandStderr(error);
    const markerIndex = stderr.indexOf(runtimeStartMarker);
    if (markerIndex === -1) {
      throw error;
    }
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      runtimeStarted: true,
      stderr: stderr.slice(markerIndex + runtimeStartMarker.length),
    });
  }
}

async function runCommandDefault(
  command: string,
  args: string[],
  options: { cwd?: string | undefined; env: NodeJS.ProcessEnv; shell?: boolean | undefined },
): Promise<SetupCommandResult> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env,
    maxBuffer: Number.MAX_SAFE_INTEGER,
    shell: options.shell === true,
    windowsHide: true,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}

function parseCommandArgs(args: string[]): ParsedCommandArgs {
  if (args[0] === "launch") {
    const parsed = parseRuntimeLauncherArgs(args.slice(1));
    return "error" in parsed ? parsed : { kind: "launch", args: parsed };
  }
  const parsed = parseSetupArgs(args);
  return "error" in parsed ? parsed : { kind: "setup", args: parsed };
}

function parseRuntimeLauncherArgs(args: string[]): RuntimeLauncherArgs | { error: string } {
  let workspaceRoot: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      const runtimeArgs = args.slice(index + 1);
      return runtimeArgs.length === 0
        ? { error: "launch requires runtime arguments." }
        : { ...(workspaceRoot === undefined ? {} : { workspaceRoot }), runtimeArgs };
    }
    if (arg === "--workspace") {
      workspaceRoot = args[index + 1];
      if (workspaceRoot === undefined || workspaceRoot.length === 0) {
        return { error: "--workspace requires a value." };
      }
      index += 1;
      continue;
    }
    if (arg?.startsWith("--workspace=")) {
      workspaceRoot = arg.slice("--workspace=".length);
      if (workspaceRoot.length === 0) {
        return { error: "--workspace requires a value." };
      }
      continue;
    }
    return {
      ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
      runtimeArgs: args.slice(index),
    };
  }

  return { error: "launch requires runtime arguments." };
}

function parseSetupArgs(args: string[]): SetupArgs | { error: string } {
  const parsed: SetupArgs = {
    cleanupOnly: false,
    dryRun: false,
    verifyRemote: false,
    yes: false,
    selection: { kind: "default" },
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--runtime-only") {
      parsed.cleanupOnly = true;
      continue;
    }
    if (arg === "--verify-remote") {
      parsed.verifyRemote = true;
      continue;
    }
    if (arg === "--yes") {
      parsed.yes = true;
      continue;
    }
    if (arg === "--agents") {
      const value = args[index + 1];
      if (value === undefined) {
        return { error: "--agents requires a value." };
      }
      const selection = parseAgentSelection(value);
      if (selection === undefined) {
        return { error: invalidAgentsMessage };
      }
      parsed.selection = selection;
      index += 1;
      continue;
    }
    if (arg.startsWith("--agents=")) {
      const selection = parseAgentSelection(arg.slice("--agents=".length));
      if (selection === undefined) {
        return { error: invalidAgentsMessage };
      }
      parsed.selection = selection;
      continue;
    }
    return { error: `Unknown setup option: ${arg}` };
  }

  return parsed;
}

function parseAgentSelection(input: string): AgentSelection | undefined {
  if (input === "auto") {
    return { kind: "auto" };
  }
  const agents = new Set<SetupAgentId>();
  for (const value of input.split(",").map((agent) => agent.trim())) {
    if (!isSetupAgentId(value)) {
      return undefined;
    }
    agents.add(value);
  }
  return agents.size > 0 ? { kind: "explicit", agents } : undefined;
}

function isSetupAgentId(value: string): value is SetupAgentId {
  return setupAgentProfiles.some((profile) => profile.id === value);
}

function isSelected(
  profile: SetupAgentProfile,
  detected: boolean,
  cleanupOnly: boolean,
  selection: AgentSelection,
): boolean {
  if (cleanupOnly || !detected) {
    return false;
  }
  if (selection.kind === "explicit") {
    return selection.agents.has(profile.id);
  }
  return profile.defaultSelected;
}

function parseNodeMajorVersion(version: string): number | undefined {
  const match = /^v?(\d+)(?:\.|$)/.exec(version);
  return match === null ? undefined : Number.parseInt(match[1] ?? "", 10);
}
