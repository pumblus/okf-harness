import { accessSync, constants } from "node:fs";
import path from "node:path";
import type { AgentAdapter } from "@okf-harness/agent-pack";

export type WorkspaceRefreshHint = {
  agentClient: AgentAdapter;
  workspacePath: string;
  message: string;
  commands?: [string, string];
};

type ShellFamily = "cmd" | "posix" | "powershell";
type CommandOmissionReason = "unsafe-cmd-path" | "unknown-windows-shell";

type RefreshProfile = {
  executable: string;
  label: string;
  skill: string;
};

type ExecutableLookupContext = {
  runtimePlatform: NodeJS.Platform | string;
  env: NodeJS.ProcessEnv;
};

export type CreateWorkspaceRefreshHintOptions = {
  agentClient: AgentAdapter;
  workspaceRoot: string;
  runtimePlatform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv;
  executableOnPath?: (executable: string, context: ExecutableLookupContext) => boolean;
};

const refreshProfiles: Record<AgentAdapter, RefreshProfile> = {
  claude: {
    executable: "claude",
    label: "Claude Code",
    skill: "/okf-harness",
  },
  codex: {
    executable: "codex",
    label: "Codex",
    skill: "$okf-harness",
  },
};

export function createWorkspaceRefreshHint(
  options: CreateWorkspaceRefreshHintOptions,
): WorkspaceRefreshHint {
  const runtimePlatform = options.runtimePlatform ?? process.platform;
  const env = options.env ?? process.env;
  const profile = refreshProfiles[options.agentClient];
  const workspacePath = pathApiFor(runtimePlatform).resolve(options.workspaceRoot);
  const executableOnPath = options.executableOnPath ?? executableExistsOnPath;
  const executableAvailable = executableOnPath(profile.executable, { runtimePlatform, env });
  const commandPlan = executableAvailable
    ? refreshCommandPlan({
        executable: profile.executable,
        runtimePlatform,
        env,
        workspacePath,
      })
    : undefined;
  const hint: WorkspaceRefreshHint = {
    agentClient: options.agentClient,
    workspacePath,
    message: refreshMessage(profile, workspacePath, executableAvailable, commandPlan?.reason),
  };

  if (commandPlan?.commands === undefined) {
    return hint;
  }

  return {
    ...hint,
    commands: commandPlan.commands,
  };
}

function refreshMessage(
  profile: RefreshProfile,
  workspacePath: string,
  executableAvailable: boolean,
  commandOmissionReason: CommandOmissionReason | undefined,
): string {
  if (executableAvailable && commandOmissionReason === undefined) {
    return `Start a fresh ${profile.label} session from ${workspacePath} so ${profile.skill} is loaded.`;
  }

  if (commandOmissionReason === "unknown-windows-shell") {
    return `Open ${profile.label} from ${workspacePath} so ${profile.skill} is loaded. The active Windows shell could not be detected safely, so no command lines are included.`;
  }

  if (commandOmissionReason === "unsafe-cmd-path") {
    return `Open ${profile.label} from ${workspacePath} so ${profile.skill} is loaded. The workspace path contains characters that are unsafe for Command Prompt command lines, so no command lines are included.`;
  }

  return `Open ${profile.label} from ${workspacePath} so ${profile.skill} is loaded. The ${profile.executable} executable was not found on PATH, so no command lines are included.`;
}

function refreshCommandPlan(options: {
  executable: string;
  runtimePlatform: NodeJS.Platform | string;
  env: NodeJS.ProcessEnv;
  workspacePath: string;
}):
  | { commands: [string, string]; reason?: never }
  | { commands?: never; reason: CommandOmissionReason } {
  const shellFamily = shellFamilyFor(options.runtimePlatform, options.env);
  if (shellFamily === undefined) {
    return { reason: "unknown-windows-shell" };
  }
  if (shellFamily === "cmd" && /[%!]/.test(options.workspacePath)) {
    return { reason: "unsafe-cmd-path" };
  }
  return {
    commands: refreshCommands({
      executable: options.executable,
      shellFamily,
      workspacePath: options.workspacePath,
    }),
  };
}

function refreshCommands(options: {
  executable: string;
  shellFamily: ShellFamily;
  workspacePath: string;
}): [string, string] {
  switch (options.shellFamily) {
    case "cmd":
      return [`cd /d ${quoteCmd(options.workspacePath)}`, options.executable];
    case "powershell":
      return [
        `Set-Location -LiteralPath ${quotePowerShell(options.workspacePath)}`,
        options.executable,
      ];
    case "posix":
      return [`cd ${quotePosix(options.workspacePath)}`, options.executable];
  }
}

function shellFamilyFor(
  runtimePlatform: NodeJS.Platform | string,
  env: NodeJS.ProcessEnv,
): ShellFamily | undefined {
  if (runtimePlatform !== "win32") {
    return "posix";
  }

  // ponytail: Windows has no reliable parent-shell env; emit commands only for explicit signals.
  const shell = envValue(env, "SHELL") ?? "";
  if (/\b(?:pwsh|powershell)(?:\.exe)?\b/i.test(shell)) {
    return "powershell";
  }
  if (/\bcmd(?:\.exe)?\b/i.test(shell)) {
    return "cmd";
  }
  return undefined;
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteCmd(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function executableExistsOnPath(executable: string, context: ExecutableLookupContext): boolean {
  const searchPath = envValue(context.env, "PATH");
  if (searchPath === undefined || searchPath.length === 0) {
    return false;
  }

  const delimiter = context.runtimePlatform === "win32" ? ";" : ":";
  const pathApi = pathApiFor(context.runtimePlatform);
  for (const directory of searchPath.split(delimiter)) {
    if (directory.length === 0) {
      continue;
    }
    for (const extension of executableExtensions(executable, context)) {
      if (
        isExecutable(pathApi.join(directory, `${executable}${extension}`), context.runtimePlatform)
      ) {
        return true;
      }
    }
  }
  return false;
}

function executableExtensions(executable: string, context: ExecutableLookupContext): string[] {
  if (context.runtimePlatform !== "win32") {
    return [""];
  }

  const configured = envValue(context.env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD";
  const extensions = configured
    .split(";")
    .map((extension) => extension.trim())
    .filter((extension) => extension.length > 0);
  return path.win32.extname(executable).length > 0 ? ["", ...extensions] : extensions;
}

function isExecutable(filePath: string, runtimePlatform: NodeJS.Platform | string): boolean {
  try {
    accessSync(filePath, runtimePlatform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathApiFor(runtimePlatform: NodeJS.Platform | string): typeof path.posix {
  return runtimePlatform === "win32" ? path.win32 : path.posix;
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const direct = env[key];
  if (direct !== undefined) {
    return direct;
  }

  const normalizedKey = key.toLowerCase();
  for (const [name, value] of Object.entries(env)) {
    if (name.toLowerCase() === normalizedKey) {
      return value;
    }
  }
  return undefined;
}
