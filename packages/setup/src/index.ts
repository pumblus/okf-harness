import { constants, readFileSync } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";

export const packageInfo = {
  name: "@okf-harness/setup",
  role: "setup",
} as const;

export type PackageInfo = typeof packageInfo;

export type SetupAgentId = "claude" | "codex" | "opencode" | "pi" | "hermes" | "openclaw";

export type SetupIo = {
  writeOut: (chunk: string) => void;
  writeErr: (chunk: string) => void;
};

export type RunSetupOptions = {
  env?: NodeJS.ProcessEnv;
  nodeVersion?: string;
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
  agents: SetupAgentPlan[];
};

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

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
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "okf-harness@okf-harness from the Codex marketplace",
  },
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "opencode plugin @pumblus/okf-harness --global",
  },
  {
    id: "pi",
    label: "Pi",
    command: "pi",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "pi install npm:@pumblus/okf-harness",
  },
  {
    id: "hermes",
    label: "Hermes Agent",
    command: "hermes",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "pumblus/okf-harness/okf-harness from the Hermes skill tap",
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    command: "openclaw",
    supportLevel: "native-supported",
    defaultSelected: false,
    nativeInstall: "@pumblus/okf-harness from the OpenClaw native skill registry",
  },
];

export async function runSetup(
  argv: string[] = process.argv,
  io: SetupIo = {
    writeOut: (chunk) => process.stdout.write(chunk),
    writeErr: (chunk) => process.stderr.write(chunk),
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
    env: options.env ?? process.env,
    nodeVersion,
  });
  writeOut(renderSetupPlan(plan));

  return { exitCode: 0, stdout: stdout.join(""), stderr: stderr.join("") };
}

async function createSetupPlan(
  options: SetupArgs & { env: NodeJS.ProcessEnv; nodeVersion: string },
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
      lines.push(`  Native install: ${agent.nativeInstall}`);
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
