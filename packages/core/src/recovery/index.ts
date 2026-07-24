import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

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

const execFileAsync = promisify(execFile);

export async function initializeRecovery(workspaceRootInput: string): Promise<void> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  await runRecoveryCommand(workspaceRoot, ["init", "--quiet"], "initialize");
  await runRecoveryCommand(workspaceRoot, ["add", "--all"], "initialize");
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
      "OKF Harness workspace initialized",
    ],
    "initialize",
  );
}

export async function listCompletions(workspaceRootInput: string): Promise<Completion[]> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  if (!(await hasRecoverySubstrate(workspaceRoot))) {
    return [];
  }

  const stdout = await runRecoveryCommand(
    workspaceRoot,
    ["log", "-z", "--format=%H%x00%b"],
    "read",
  );
  const fields = stdout.split("\0");
  const revisions: Completion[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const revision = fields[index];
    if (revision === undefined || revision.length === 0) {
      continue;
    }
    revisions.push({
      id: `completion_${Buffer.from(revision, "hex").toString("base64url")}`,
      judgment: fields[index + 1]?.trim() ?? "",
    });
  }

  return revisions.slice(0, -1);
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
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: workspaceRoot });
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

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
