import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";

import {
  collectShadowingGlobalInstalls,
  type DetectedShadowingGlobalInstall,
  isShadowingOkfhExecutable,
  type NativeInstallCommand,
  parseGlobalPackageVersion,
  shadowingGlobalInstallProfiles,
} from "./integrations.js";
import type { NativeIntegrationProbeResult } from "./verification.js";

export type ProbeRunner = (
  command: string,
  args: string[],
  options: {
    cwd?: string | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    shell?: boolean | undefined;
  },
) => Promise<{ stdout: string; stderr: string; exitCode?: number | undefined }>;

/**
 * Finds an executable on PATH. The lookup policy is shared by setup, doctor,
 * and refresh guidance: the bare command name is checked first, then PATHEXT
 * variants (lowercase and uppercase), so every surface answers the same
 * "is this executable on the host" question the same way.
 */
export async function findExecutable(
  command: string,
  env: NodeJS.ProcessEnv,
  accept: (executablePath: string) => boolean = () => true,
): Promise<string | undefined> {
  return findExecutableOn(command, env, path.delimiter, accept);
}

/**
 * Async boolean form of {@link findExecutable} for the refresh guidance path,
 * which answers the same question against an explicit runtime platform.
 *
 * The PATH entries are split by the simulated platform's delimiter, but
 * candidate paths are joined with the host path API: the directories being
 * probed live on the running host's filesystem, so only host separators can
 * resolve them. On a real platform the two always agree.
 */
export async function executableExistsOnPath(
  executable: string,
  context: { env: NodeJS.ProcessEnv; runtimePlatform: NodeJS.Platform | string },
): Promise<boolean> {
  const delimiter = context.runtimePlatform === "win32" ? ";" : ":";
  return (await findExecutableOn(executable, context.env, delimiter)) !== undefined;
}

async function findExecutableOn(
  command: string,
  env: NodeJS.ProcessEnv,
  pathDelimiter: string,
  accept: (executablePath: string) => boolean = () => true,
): Promise<string | undefined> {
  const pathValue = env.PATH ?? "";
  for (const directory of pathValue.split(pathDelimiter).filter((entry) => entry.length > 0)) {
    for (const candidate of executableCandidates(command, env)) {
      // Join with the host path API: the directory came from this host's PATH
      // (or a simulated one) but must resolve to a file on this host.
      const candidatePath = path.join(directory, candidate);
      if ((await isExecutableFile(candidatePath)) && accept(candidatePath)) {
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

/**
 * Runs the probe commands of a native integration verification definition in
 * order, shaping each result for {@link verifyNativeIntegration}: a successful
 * run reports `exitCode ?? 0`, a thrown error reports the captured exit code
 * when one can be read, and the first nonzero or failed probe stops the loop.
 */
export async function probeCommands(
  commands: readonly NativeInstallCommand[],
  run: ProbeRunner,
  options: {
    env: NodeJS.ProcessEnv;
    invocation: (command: string) => { command: string; cwd?: string; shell: boolean };
    onProbe?: (command: NativeInstallCommand) => void;
  },
): Promise<NativeIntegrationProbeResult[]> {
  const probeResults: NativeIntegrationProbeResult[] = [];
  for (const probeCommand of commands) {
    options.onProbe?.(probeCommand);
    const invocation = options.invocation(probeCommand.command);
    try {
      const result = await run(invocation.command, probeCommand.args, {
        ...(invocation.cwd === undefined ? {} : { cwd: invocation.cwd }),
        env: options.env,
        shell: invocation.shell,
      });
      probeResults.push({ stdout: result.stdout, exitCode: result.exitCode ?? 0 });
      if ((result.exitCode ?? 0) !== 0) {
        break;
      }
    } catch (error) {
      const exitCode = commandExitCode(error);
      probeResults.push({ stdout: "", ...(exitCode === undefined ? {} : { exitCode }) });
      break;
    }
  }
  return probeResults;
}

const WINDOWS_SHELL_ALLOWLIST = ["git", "npm", "okfh", "pnpm"] as const;

/**
 * Whether a command must run through a shell on Windows. The allowlist is the
 * union of the surfaces that need it (setup, doctor), so no caller decides
 * differently about the same executable.
 */
export function shouldUseWindowsShell(
  runtimePlatform: NodeJS.Platform | string,
  executable: string,
): boolean {
  return (
    runtimePlatform === "win32" &&
    (WINDOWS_SHELL_ALLOWLIST as readonly string[]).includes(executable)
  );
}

/**
 * The single Windows invocation strategy for resolved executables: a `.cmd`
 * or `.bat` file runs through a shell from its own directory (where the shell
 * can resolve the bare name), anything else runs directly by its resolved
 * path. Non-Windows platforms always run the resolved path directly.
 */
export function windowsShellInvocation(
  command: string,
  executablePath: string | undefined,
  runtimePlatform: NodeJS.Platform | string,
): { command: string; cwd?: string; shell: boolean } {
  const resolved = executablePath ?? command;
  const pathApi = pathApiFor(runtimePlatform);
  const shell =
    runtimePlatform === "win32" &&
    executablePath !== undefined &&
    [".bat", ".cmd"].includes(pathApi.extname(executablePath).toLowerCase());
  return {
    command: shell ? pathApi.basename(resolved) : resolved,
    ...(shell ? { cwd: pathApi.dirname(resolved) } : {}),
    shell,
  };
}

export function pathApiFor(runtimePlatform: NodeJS.Platform | string): typeof path.posix {
  return runtimePlatform === "win32" ? path.win32 : path.posix;
}

type HostProbeShadowingOptions = {
  env: NodeJS.ProcessEnv;
  runCommand: ProbeRunner;
  runtimePlatform: NodeJS.Platform | string;
};

/**
 * Detects shadowing global installs (a leftover global executable or globally
 * installed bootstrap package) using the shared shadowing profiles. Setup and
 * doctor both delegate here; only their presentation differs.
 */
export async function detectShadowingGlobalInstalls(
  options: HostProbeShadowingOptions,
): Promise<DetectedShadowingGlobalInstall[]> {
  const runtimeProfile = shadowingGlobalInstallProfiles[0];
  const bootstrapProfile = shadowingGlobalInstallProfiles[1];
  const [executablePath, bootstrapVersion] = await Promise.all([
    findExecutable(runtimeProfile.executable, options.env, isShadowingOkfhExecutable),
    detectGlobalPackageVersion(bootstrapProfile.packageName, options),
  ]);

  return collectShadowingGlobalInstalls({
    ...(executablePath === undefined ? {} : { executablePath }),
    ...(bootstrapVersion === undefined ? {} : { bootstrapVersion }),
  });
}

export async function detectGlobalPackageVersion(
  packageName: string,
  options: HostProbeShadowingOptions,
): Promise<string | undefined> {
  const args = ["ls", "-g", packageName, "--json", "--depth=0"];
  try {
    const result = await options.runCommand("npm", args, {
      env: options.env,
      shell: shouldUseWindowsShell(options.runtimePlatform, "npm"),
    });
    return parseGlobalPackageVersion(result.stdout, packageName);
  } catch (error) {
    return parseGlobalPackageVersion(commandStdout(error), packageName);
  }
}

/** Reads a numeric process exit code from a thrown command error. */
export function commandExitCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("exitCode" in error && typeof error.exitCode === "number") {
    return error.exitCode;
  }
  return "code" in error && typeof error.code === "number" ? error.code : undefined;
}

/** Reads captured stdout from a thrown command error. */
export function commandStdout(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "stdout" in error &&
    typeof error.stdout === "string"
    ? error.stdout
    : "";
}

/** Reads captured stderr from a thrown command error. */
export function commandStderr(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof error.stderr === "string"
    ? error.stderr
    : "";
}

/** Composes the message and captured output of a thrown command error. */
export function commandErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    const output = [commandStdout(error), commandStderr(error)].filter(Boolean).join("\n").trim();
    return output.length > 0 ? `${error.message}\n${output}` : error.message;
  }
  return String(error);
}

/** Reads a string error code such as `ENOENT` from a thrown error. */
export function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
