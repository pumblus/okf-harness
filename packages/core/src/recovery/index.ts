import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadWorkspaceConfig } from "../config/index.js";

export type Completion = {
  id: string;
  judgment: string;
};

export class RecoveryError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "RecoveryError";
  }
}

const INITIAL_RECOVERY_SUBJECT = "OKF Harness workspace initialized";
const execFileAsync = promisify(execFile);

export async function initializeRecovery(workspaceRootInput: string): Promise<void> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const env = recoveryEnvironment(config.workspace.created_at);
  await runRecoveryCommand(workspaceRoot, ["init", "--quiet"], "initialize", env);
  await runRecoveryCommand(workspaceRoot, ["add", "--all"], "initialize", env);
  await runRecoveryCommand(
    workspaceRoot,
    [
      "-c",
      "user.name=OKF Harness",
      "-c",
      "user.email=workspace@okf-harness.local",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--quiet",
      "--no-verify",
      "-m",
      INITIAL_RECOVERY_SUBJECT,
    ],
    "initialize",
    env,
  );
}

export async function listCompletions(workspaceRootInput: string): Promise<Completion[]> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  await loadWorkspaceConfig(workspaceRoot);
  if (!(await hasRecoverySubstrate(workspaceRoot))) {
    return [];
  }

  const count = await runRecoveryCommand(workspaceRoot, ["rev-list", "--all", "--count"], "read");
  if (count.trim() === "0") {
    return [];
  }

  const stdout = await runRecoveryCommand(
    workspaceRoot,
    ["log", "-z", "--format=%H%x00%s%x00%b"],
    "read",
  );
  const fields = stdout.split("\0");
  const revisions: Array<Completion & { subject: string }> = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const revision = fields[index];
    if (revision === undefined || revision.length === 0) {
      continue;
    }
    revisions.push({
      id: `completion_${Buffer.from(revision, "hex").toString("base64url")}`,
      subject: fields[index + 1] ?? "",
      judgment: fields[index + 2]?.trim() ?? "",
    });
  }

  const baseline = revisions.findIndex((revision) => revision.subject === INITIAL_RECOVERY_SUBJECT);
  return baseline === -1
    ? []
    : revisions.slice(0, baseline).map(({ id, judgment }) => ({ id, judgment }));
}

async function hasRecoverySubstrate(workspaceRoot: string): Promise<boolean> {
  try {
    await lstat(path.join(workspaceRoot, ".git"));
    return true;
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }
    throw new RecoveryError("Workspace recovery could not be read.", "RECOVERY_READ_FAILED");
  }
}

async function runRecoveryCommand(
  workspaceRoot: string,
  args: string[],
  action: "initialize" | "read",
  env: NodeJS.ProcessEnv = recoveryEnvironment(),
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: workspaceRoot, env });
    return stdout;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new RecoveryError(
        "Workspace recovery is unavailable on this machine.",
        "RECOVERY_UNAVAILABLE",
      );
    }
    throw new RecoveryError(
      action === "initialize"
        ? "Workspace recovery could not be initialized."
        : "Workspace recovery could not be read.",
      action === "initialize" ? "RECOVERY_INIT_FAILED" : "RECOVERY_READ_FAILED",
    );
  }
}

function recoveryEnvironment(timestamp?: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")),
  );
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  if (timestamp !== undefined) {
    env.GIT_AUTHOR_DATE = timestamp;
    env.GIT_COMMITTER_DATE = timestamp;
  }
  return env;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
