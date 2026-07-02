import { execFile } from "node:child_process";
import { constants, readFileSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

export const packageInfo = {
  name: "@okf-harness/setup",
  role: "setup",
} as const;

export type PackageInfo = typeof packageInfo;

export type SetupAgentId = "claude" | "codex" | "opencode" | "pi" | "hermes" | "openclaw";

export type SetupIo = {
  writeOut: (chunk: string) => void;
  writeErr: (chunk: string) => void;
  readLine?: (prompt: string) => Promise<string>;
};

export type SetupCommandResult = {
  stdout: string;
  stderr: string;
};

export type RunSetupCommand = (
  command: string,
  args: string[],
  options: { cwd?: string | undefined; env: NodeJS.ProcessEnv; shell?: boolean | undefined },
) => Promise<SetupCommandResult>;

export type SetupNativeInstallCommand = {
  command: string;
  args: string[];
};

export type SetupRuntimePlan = {
  state: "missing" | "current" | "older" | "newer" | "unknown";
  packageName: "@okf-harness/cli";
  targetVersion: string;
  installCommand: string;
  currentVersion?: string;
};

export type RunSetupOptions = {
  env?: NodeJS.ProcessEnv;
  nodeVersion?: string;
  runtimePlatform?: NodeJS.Platform | string;
  runCommand?: RunSetupCommand;
};

export type SetupRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type SetupArgs = {
  dryRun: boolean;
  runtimeOnly: boolean;
  verifyRemote: boolean;
  yes: boolean;
  selection: AgentSelection;
};

type AgentSelection =
  | { kind: "default" }
  | { kind: "auto" }
  | { kind: "explicit"; agents: Set<SetupAgentId> };

type SetupAgentProfile = {
  id: SetupAgentId;
  label: string;
  command: string;
  supportLevel: "native-supported";
  defaultSelected: boolean;
  nativeInstall: string;
  nativeInstallCommands: readonly SetupNativeInstallCommand[];
};

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
  installLaterCommand: string;
  executablePath?: string;
};

export type SetupPlan = {
  setupVersion: string;
  nodeVersion: string;
  dryRun: boolean;
  runtimeOnly: boolean;
  verifyRemote: boolean;
  yes: boolean;
  warnings: string[];
  runtime: SetupRuntimePlan;
  agents: SetupAgentPlan[];
};

const execFileAsync = promisify(execFile);
const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const runtimePackageName = "@okf-harness/cli";

const invalidAgentsMessage =
  "Setup agents must be: auto, claude, codex, opencode, pi, hermes, openclaw.";

const setupAgentProfiles: readonly SetupAgentProfile[] = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "okf-harness@okf-harness from the Claude Code marketplace",
    nativeInstallCommands: [
      { command: "claude", args: ["plugin", "marketplace", "add", "pumblus/okf-harness"] },
      { command: "claude", args: ["plugin", "install", "okf-harness@okf-harness"] },
    ],
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "okf-harness@okf-harness from the Codex marketplace",
    nativeInstallCommands: [
      {
        command: "codex",
        args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"],
      },
      { command: "codex", args: ["plugin", "add", "okf-harness@okf-harness", "--json"] },
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "opencode plugin @pumblus/okf-harness --global",
    nativeInstallCommands: [
      { command: "opencode", args: ["plugin", "@pumblus/okf-harness", "--global"] },
    ],
  },
  {
    id: "pi",
    label: "Pi",
    command: "pi",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "pi install npm:@pumblus/okf-harness",
    nativeInstallCommands: [{ command: "pi", args: ["install", "npm:@pumblus/okf-harness"] }],
  },
  {
    id: "hermes",
    label: "Hermes Agent",
    command: "hermes",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "pumblus/okf-harness/okf-harness from the Hermes skill tap",
    nativeInstallCommands: [
      { command: "hermes", args: ["skills", "tap", "add", "pumblus/okf-harness"] },
      { command: "hermes", args: ["skills", "install", "pumblus/okf-harness/okf-harness"] },
    ],
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    command: "openclaw",
    supportLevel: "native-supported",
    defaultSelected: false,
    nativeInstall: "@pumblus/okf-harness from the OpenClaw native skill registry",
    nativeInstallCommands: [
      { command: "openclaw", args: ["skills", "install", "@pumblus/okf-harness", "--global"] },
    ],
  },
];

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

  const parsed = parseSetupArgs(argv.slice(2));
  if ("error" in parsed) {
    writeErr(`${parsed.error}\n`);
    return { exitCode: 1, stdout: stdout.join(""), stderr: stderr.join("") };
  }

  const env = options.env ?? process.env;
  const runtimePlatform = options.runtimePlatform ?? process.platform;
  const runCommand = options.runCommand ?? runCommandDefault;
  const nodeVersion = options.nodeVersion ?? process.version;
  const nodeMajor = parseNodeMajorVersion(nodeVersion);
  if (nodeMajor === undefined || nodeMajor < 22) {
    writeErr(
      "OKF Harness setup requires Node.js 22 or newer. Download Node.js from https://nodejs.org.\n",
    );
    return { exitCode: 1, stdout: stdout.join(""), stderr: stderr.join("") };
  }

  const plan = await createSetupPlan({
    ...parsed,
    env,
    nodeVersion,
    runCommand,
    runtimePlatform,
  });
  writeOut(renderSetupPlan(plan));

  if (!parsed.dryRun) {
    const runtimeResult = await installRuntime({
      env,
      io: { ...io, writeOut, writeErr },
      parsed,
      plan,
      runCommand,
      runtimePlatform,
    });
    if (runtimeResult.exitCode !== 0) {
      return {
        exitCode: runtimeResult.exitCode,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      };
    }

    const nativeInstallExitCode = await installSelectedNativeIntegrations({
      env,
      io: { ...io, writeOut, writeErr },
      parsed,
      plan,
      runCommand,
      runtimePlatform,
    });
    if (nativeInstallExitCode !== 0) {
      return {
        exitCode: nativeInstallExitCode,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      };
    }

    if (runtimeResult.verify) {
      const verifyExitCode = await verifyRuntime({
        env,
        io: { ...io, writeOut, writeErr },
        runCommand,
        runtimePlatform,
      });
      if (verifyExitCode !== 0) {
        return {
          exitCode: verifyExitCode,
          stdout: stdout.join(""),
          stderr: stderr.join(""),
        };
      }
    }
  }

  return { exitCode: 0, stdout: stdout.join(""), stderr: stderr.join("") };
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
      const selected = isSelected(profile, detected, options.runtimeOnly, options.selection);
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
        installLaterCommand: `npx @okf-harness/setup@latest --agents ${profile.id}`,
        ...(executablePath === undefined ? {} : { executablePath }),
      };
    }),
  );
  const git = await findExecutable("git", options.env);
  return {
    setupVersion: packageVersion.version,
    nodeVersion: options.nodeVersion,
    dryRun: options.dryRun,
    runtimeOnly: options.runtimeOnly,
    verifyRemote: options.verifyRemote,
    yes: options.yes,
    runtime: await createRuntimePlan(options),
    warnings:
      git === undefined
        ? [
            "Warning: git was not found; workspace management may need git later, but native integration planning can continue.",
          ]
        : [],
    agents,
  };
}

export function renderSetupPlan(plan: SetupPlan): string {
  const lines = [
    "OKF Harness Setup plan",
    `Resolved setup version: ${plan.setupVersion}`,
    `Node.js: ${plan.nodeVersion} (meets >=22)`,
    renderRuntimeLine(plan.runtime),
    plan.dryRun
      ? "Dry run: no network checks or filesystem writes."
      : "Plan: no filesystem writes until installation is confirmed.",
    plan.verifyRemote
      ? "Remote checks: requested with --verify-remote; reserved for explicit availability checks and not implied by dry-run."
      : "Remote checks: not requested.",
  ];

  if (plan.runtimeOnly) {
    lines.push("Runtime only: agent integrations are not selected.");
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

async function createRuntimePlan(options: {
  env: NodeJS.ProcessEnv;
  runCommand: RunSetupCommand;
  runtimePlatform: NodeJS.Platform | string;
}): Promise<SetupRuntimePlan> {
  const targetVersion = packageVersion.version;
  const installCommand = commandToString(runtimeInstallCommand(targetVersion));
  try {
    const result = await options.runCommand(
      "npm",
      ["ls", "-g", runtimePackageName, "--json", "--depth=0"],
      {
        env: options.env,
        shell: shouldUseWindowsShell(options.runtimePlatform, "npm"),
      },
    );
    const currentVersion = parseInstalledRuntimeVersion(result.stdout);
    if (currentVersion === undefined) {
      return { state: "missing", packageName: runtimePackageName, targetVersion, installCommand };
    }
    const comparison = compareVersions(currentVersion, targetVersion);
    if (comparison === undefined) {
      return {
        state: "unknown",
        packageName: runtimePackageName,
        targetVersion,
        installCommand,
        currentVersion,
      };
    }
    return {
      state: comparison < 0 ? "older" : comparison > 0 ? "newer" : "current",
      packageName: runtimePackageName,
      targetVersion,
      installCommand,
      currentVersion,
    };
  } catch {
    return { state: "missing", packageName: runtimePackageName, targetVersion, installCommand };
  }
}

function renderRuntimeLine(runtime: SetupRuntimePlan): string {
  const current = runtime.currentVersion === undefined ? "" : ` current ${runtime.currentVersion},`;
  return `Runtime: ${runtime.state};${current} target ${runtime.packageName}@${runtime.targetVersion}`;
}

type RuntimeInstallResult = {
  exitCode: number;
  verify: boolean;
};

async function installRuntime(options: {
  env: NodeJS.ProcessEnv;
  io: Required<Pick<SetupIo, "writeOut" | "writeErr">> & Pick<SetupIo, "readLine">;
  parsed: SetupArgs;
  plan: SetupPlan;
  runCommand: RunSetupCommand;
  runtimePlatform: NodeJS.Platform | string;
}): Promise<RuntimeInstallResult> {
  const runtime = options.plan.runtime;
  if (runtime.state === "older") {
    options.io.writeOut(
      `Runtime update available: current ${runtime.currentVersion}, target ${runtime.targetVersion}.\n`,
    );
    const shouldUpdate =
      options.parsed.yes || (await confirmYes(options.io, "Update global okfh runtime? [Y/n] "));
    if (!shouldUpdate) {
      options.io.writeOut("Runtime update skipped.\n");
      return { exitCode: 0, verify: false };
    }
  }

  if (runtime.state === "missing" || runtime.state === "older") {
    const installCommand = runtimeInstallCommand(runtime.targetVersion);
    options.io.writeOut(
      `${runtime.state === "older" ? "Updating" : "Installing"} runtime: ${commandToString(
        installCommand,
      )}\n`,
    );
    try {
      await options.runCommand(installCommand.command, installCommand.args, {
        env: options.env,
        shell: shouldUseWindowsShell(options.runtimePlatform, installCommand.command),
      });
    } catch (error) {
      writeRuntimeCommandFailure(
        options.io.writeErr,
        "Runtime installation failed",
        installCommand,
        error,
      );
      return { exitCode: 1, verify: false };
    }
  }

  if (runtime.state === "unknown") {
    options.io.writeOut(
      `Runtime installation skipped: installed ${runtime.packageName} version ${runtime.currentVersion} could not be compared with ${runtime.targetVersion}.\n`,
    );
  }

  return { exitCode: 0, verify: true };
}

type NativeInstallFailure = {
  agent: SetupAgentPlan;
  command: SetupNativeInstallCommand;
  completedCommands: SetupNativeInstallCommand[];
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

  const successfulAgents: SetupAgentPlan[] = [];
  const failures: NativeInstallFailure[] = [];
  for (const agent of agents) {
    let failed = false;
    const completedCommands: SetupNativeInstallCommand[] = [];
    for (const installCommand of agent.nativeInstallCommands) {
      options.io.writeOut(`Installing ${agent.label}: ${commandToString(installCommand)}\n`);
      const shell = shouldUseNativeInstallShell(options.runtimePlatform, agent.executablePath);
      const executable = agent.executablePath ?? installCommand.command;
      const command = shell ? path.basename(executable) : executable;
      const cwd = shell ? path.dirname(executable) : undefined;
      try {
        await options.runCommand(command, installCommand.args, {
          ...(cwd === undefined ? {} : { cwd }),
          env: options.env,
          shell,
        });
        completedCommands.push(installCommand);
      } catch (error) {
        failed = true;
        failures.push({ agent, command: installCommand, completedCommands });
        writeNativeInstallCommandFailure(options.io.writeErr, agent, installCommand, error);
        break;
      }
    }
    if (!failed) {
      successfulAgents.push(agent);
    }
  }

  writeNativeInstallSummary(options.io.writeOut, successfulAgents, failures);
  return failures.length === 0 ? 0 : 1;
}

function writeNativeInstallCommandFailure(
  writeErr: (chunk: string) => void,
  agent: SetupAgentPlan,
  command: SetupNativeInstallCommand,
  error: unknown,
): void {
  writeErr(`Native integration failed: ${agent.label}\n`);
  writeErr(`Command: ${commandToString(command)}\n`);
  const details = commandErrorDetails(error);
  if (details.length > 0) {
    writeErr(`Details: ${details}\n`);
  }
}

function writeNativeInstallSummary(
  writeOut: (chunk: string) => void,
  successfulAgents: SetupAgentPlan[],
  failures: NativeInstallFailure[],
): void {
  writeOut("Native integration summary\n");
  writeOut(
    `Successful integrations: ${
      successfulAgents.length === 0
        ? "None"
        : successfulAgents.map((agent) => agent.label).join(", ")
    }\n`,
  );
  if (failures.length === 0) {
    writeOut("Failed integrations: None\n");
    return;
  }
  writeOut("Failed integrations:\n");
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

async function verifyRuntime(options: {
  env: NodeJS.ProcessEnv;
  io: Required<Pick<SetupIo, "writeOut" | "writeErr">>;
  runCommand: RunSetupCommand;
  runtimePlatform: NodeJS.Platform | string;
}): Promise<number> {
  const doctorCommand = { command: "okfh", args: ["doctor", "--json"] };
  let result: SetupCommandResult;
  try {
    result = await options.runCommand(doctorCommand.command, doctorCommand.args, {
      env: options.env,
      shell: shouldUseWindowsShell(options.runtimePlatform, doctorCommand.command),
    });
  } catch (error) {
    const doctor = parseDoctorEnvelope(commandStdout(error));
    if (doctor !== undefined && !hasBlockingDoctorFailure(doctor)) {
      reportSetupDoctorWarnings(options.io.writeOut, doctor);
      options.io.writeOut("Runtime verification passed: okfh doctor --json\n");
      return 0;
    }
    writeRuntimeCommandFailure(
      options.io.writeErr,
      "Runtime verification failed",
      doctorCommand,
      error,
    );
    return 1;
  }

  const doctor = parseDoctorEnvelope(result.stdout);
  if (doctor === undefined) {
    options.io.writeErr("Runtime verification failed: okfh doctor --json did not return JSON.\n");
    return 1;
  }
  reportSetupDoctorWarnings(options.io.writeOut, doctor);
  if (hasBlockingDoctorFailure(doctor)) {
    options.io.writeErr(
      "Runtime verification failed: okfh doctor --json reported runtime failures.\n",
    );
    return 1;
  }
  options.io.writeOut("Runtime verification passed: okfh doctor --json\n");
  return 0;
}

type DoctorCheckLike = { id: string; status: string; message: string };

function reportSetupDoctorWarnings(writeOut: (chunk: string) => void, doctor: unknown): void {
  const runtimeChecks =
    doctorGroupChecks(doctor, "runtime") ??
    doctorChecks(doctor).filter((check) => check.id === "runtime-git");
  const workspaceChecks =
    doctorGroupChecks(doctor, "workspace") ??
    doctorChecks(doctor).filter((check) => check.id.startsWith("workspace-"));

  for (const check of runtimeChecks) {
    if (check.status !== "warn" && check.status !== "fail") {
      continue;
    }
    if (check.id === "runtime-git") {
      writeOut(`Doctor setup warning: ${check.message}\n`);
    }
  }

  for (const check of workspaceChecks) {
    if (check.status === "warn" || check.status === "fail") {
      writeOut(`Doctor workspace warning: ${check.message}\n`);
    }
  }
}

function hasBlockingDoctorFailure(doctor: unknown): boolean {
  const runtimeChecks = doctorGroupChecks(doctor, "runtime");
  if (runtimeChecks !== undefined) {
    const nativeChecks = doctorGroupChecks(doctor, "nativeIntegrations") ?? [];
    const legacyChecks = doctorGroupChecks(doctor, "legacyBootstrapFallback") ?? [];
    const workspaceChecks = doctorGroupChecks(doctor, "workspace") ?? [];
    const groupedCheckIds = new Set(
      [...runtimeChecks, ...nativeChecks, ...legacyChecks, ...workspaceChecks].map(
        (check) => check.id,
      ),
    );
    const ungroupedChecks = doctorChecks(doctor).filter((check) => !groupedCheckIds.has(check.id));
    const hasBlockingProblem = [...runtimeChecks, ...nativeChecks, ...ungroupedChecks].some(
      (check) => check.status === "fail" && check.id !== "runtime-git",
    );
    if (hasBlockingProblem) {
      return true;
    }
    const hasKnownNonBlockingProblem = [
      ...runtimeChecks.filter((check) => check.id === "runtime-git"),
      ...legacyChecks,
      ...workspaceChecks,
    ].some((check) => check.status === "warn" || check.status === "fail");
    return doctorOk(doctor) === false && !hasKnownNonBlockingProblem;
  }

  const checks = doctorChecks(doctor);
  if (checks.some((check) => check.status === "fail" && !isSetupNonBlockingDoctorCheck(check))) {
    return true;
  }
  const hasNonBlockingProblem = checks.some(
    (check) =>
      isSetupNonBlockingDoctorCheck(check) && (check.status === "warn" || check.status === "fail"),
  );
  return doctorOk(doctor) === false && !hasNonBlockingProblem;
}

function isSetupNonBlockingDoctorCheck(check: { id: string }): boolean {
  return check.id === "runtime-git" || check.id.startsWith("workspace-");
}

function doctorOk(doctor: unknown): boolean | undefined {
  return isRecord(doctor) && typeof doctor.ok === "boolean" ? doctor.ok : undefined;
}

function doctorGroupChecks(doctor: unknown, groupId: string): DoctorCheckLike[] | undefined {
  if (
    !isRecord(doctor) ||
    !isRecord(doctor.data) ||
    !isRecord(doctor.data.groups) ||
    !isRecord(doctor.data.groups[groupId])
  ) {
    return undefined;
  }
  const group = doctor.data.groups[groupId];
  return Array.isArray(group.checks) ? parseDoctorChecks(group.checks) : undefined;
}

function doctorChecks(doctor: unknown): DoctorCheckLike[] {
  if (!isRecord(doctor) || !isRecord(doctor.data) || !Array.isArray(doctor.data.checks)) {
    return [];
  }
  return parseDoctorChecks(doctor.data.checks);
}

function parseDoctorChecks(checks: unknown[]): DoctorCheckLike[] {
  return checks.flatMap((check) => {
    if (!isRecord(check)) {
      return [];
    }
    return typeof check.id === "string" &&
      typeof check.status === "string" &&
      typeof check.message === "string"
      ? [{ id: check.id, status: check.status, message: check.message }]
      : [];
  });
}

function runtimeInstallCommand(targetVersion: string): { command: string; args: string[] } {
  return {
    command: "npm",
    args: ["install", "-g", `${runtimePackageName}@${targetVersion}`],
  };
}

async function confirmYes(io: SetupIo, prompt: string): Promise<boolean> {
  if (io.readLine === undefined) {
    return false;
  }
  const answer = (await io.readLine(prompt)).trim().toLowerCase();
  return answer === "" || answer === "y" || answer === "yes";
}

function parseInstalledRuntimeVersion(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.dependencies)) {
      return undefined;
    }
    const runtime = parsed.dependencies[runtimePackageName];
    return isRecord(runtime) && typeof runtime.version === "string" ? runtime.version : undefined;
  } catch {
    return undefined;
  }
}

function parseDoctorEnvelope(stdout: string): unknown | undefined {
  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    return undefined;
  }
}

function compareVersions(left: string, right: string): number | undefined {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  if (leftParts === undefined || rightParts === undefined) {
    return undefined;
  }
  for (let index = 0; index < leftParts.length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }
  return 0;
}

function versionParts(version: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (match === null) {
    return undefined;
  }
  return [
    Number.parseInt(match[1] ?? "", 10),
    Number.parseInt(match[2] ?? "", 10),
    Number.parseInt(match[3] ?? "", 10),
  ];
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

function commandStdout(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "stdout" in error &&
    typeof error.stdout === "string"
    ? error.stdout
    : "";
}

function commandErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    const output = [commandStdout(error), commandStderr(error)].filter(Boolean).join("\n").trim();
    return output.length > 0 ? `${error.message}\n${output}` : error.message;
  }
  return String(error);
}

function commandStderr(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof error.stderr === "string"
    ? error.stderr
    : "";
}

function isPermissionError(error: unknown): boolean {
  const details = commandErrorDetails(error).toLowerCase();
  return (
    details.includes("eacces") || details.includes("eperm") || details.includes("permission denied")
  );
}

async function runCommandDefault(
  command: string,
  args: string[],
  options: { cwd?: string | undefined; env: NodeJS.ProcessEnv; shell?: boolean | undefined },
): Promise<SetupCommandResult> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: options.shell === true,
    windowsHide: true,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}

function shouldUseWindowsShell(
  runtimePlatform: NodeJS.Platform | string,
  executable: string,
): boolean {
  return runtimePlatform === "win32" && ["npm", "okfh"].includes(executable);
}

function shouldUseNativeInstallShell(
  runtimePlatform: NodeJS.Platform | string,
  executablePath: string | undefined,
): boolean {
  return (
    runtimePlatform === "win32" &&
    executablePath !== undefined &&
    [".bat", ".cmd"].includes(path.extname(executablePath).toLowerCase())
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSetupArgs(args: string[]): SetupArgs | { error: string } {
  const parsed: SetupArgs = {
    dryRun: false,
    runtimeOnly: false,
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
      parsed.runtimeOnly = true;
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
  runtimeOnly: boolean,
  selection: AgentSelection,
): boolean {
  if (runtimeOnly || !detected) {
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

async function findExecutable(
  command: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const pathValue = env.PATH ?? "";
  for (const directory of pathValue.split(path.delimiter).filter((entry) => entry.length > 0)) {
    for (const candidate of executableCandidates(command, env)) {
      const candidatePath = path.join(directory, candidate);
      if (await isExecutableFile(candidatePath)) {
        return candidatePath;
      }
    }
  }
  return undefined;
}

function executableCandidates(command: string, env: NodeJS.ProcessEnv): string[] {
  const pathext = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => extension.length > 0);
  return [
    command,
    ...pathext.map((extension) => `${command}${extension}`),
    ...pathext.map((extension) => `${command}${extension.toUpperCase()}`),
  ];
}

async function isExecutableFile(filePath: string): Promise<boolean> {
  try {
    const entry = await stat(filePath);
    if (!entry.isFile()) {
      return false;
    }
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
