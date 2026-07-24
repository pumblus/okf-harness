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
const CHECKPOINT_SUBJECT = "OKF Harness workspace checkpoint";
const RESTORE_SUBJECT = "OKF Harness workspace restore";
const COMPLETION_ID_PREFIX = "completion_";
const RECOVERY_AUTHOR_FLAGS = [
  "-c",
  "user.name=OKF Harness",
  "-c",
  "user.email=workspace@okf-harness.local",
  "-c",
  "commit.gpgSign=false",
];
const execFileAsync = promisify(execFile);

type RecoveryAction = "initialize" | "read" | "write";

const RECOVERY_FAILURE: Record<RecoveryAction, { message: string; code: string }> = {
  initialize: {
    message: "Workspace recovery could not be initialized.",
    code: "RECOVERY_INIT_FAILED",
  },
  read: { message: "Workspace recovery could not be read.", code: "RECOVERY_READ_FAILED" },
  write: {
    message: "Workspace recovery could not be completed.",
    code: "RECOVERY_WRITE_FAILED",
  },
};

export async function initializeRecovery(workspaceRootInput: string): Promise<void> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const env = recoveryEnvironment(config.workspace.created_at);
  await runRecoveryCommand(workspaceRoot, ["init", "--quiet"], "initialize", env);
  await runRecoveryCommand(workspaceRoot, ["add", "--all"], "initialize", env);
  await runRecoveryCommand(
    workspaceRoot,
    [...RECOVERY_AUTHOR_FLAGS, "commit", "--quiet", "--no-verify", "-m", INITIAL_RECOVERY_SUBJECT],
    "initialize",
    env,
  );
}

export async function createCheckpoint(
  workspaceRootInput: string,
  judgment: string,
): Promise<Completion> {
  const trimmedJudgment = judgment.trim();
  if (trimmedJudgment.length === 0) {
    throw new RecoveryError("A judgment is required to create a checkpoint.", "JUDGMENT_REQUIRED");
  }
  const workspaceRoot = path.resolve(workspaceRootInput);
  await loadWorkspaceConfig(workspaceRoot);
  // Workspaces created before recovery became automatic adopt the substrate on
  // their first checkpoint: either no substrate yet, or an initialized but
  // revision-less one from the retired opt-in init flag.
  if (!(await hasRecoverySubstrate(workspaceRoot)) || (await revisionCount(workspaceRoot)) === 0) {
    await initializeRecovery(workspaceRoot);
  }
  await runRecoveryCommand(workspaceRoot, ["add", "--all"], "write");
  await runRecoveryCommand(
    workspaceRoot,
    [
      ...RECOVERY_AUTHOR_FLAGS,
      "commit",
      "--quiet",
      "--no-verify",
      "--allow-empty",
      "-m",
      CHECKPOINT_SUBJECT,
      "-m",
      trimmedJudgment,
    ],
    "write",
  );
  const [completion] = await listCompletions(workspaceRoot);
  if (completion === undefined) {
    throw new RecoveryError("Workspace recovery could not be read.", "RECOVERY_READ_FAILED");
  }
  return completion;
}

export async function restoreCompletion(
  workspaceRootInput: string,
  completionId: string,
): Promise<Completion> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  await loadWorkspaceConfig(workspaceRoot);
  const completions = await listCompletions(workspaceRoot);
  const completion = completions.find((candidate) => candidate.id === completionId);
  if (completion === undefined) {
    throw new RecoveryError("The completion could not be found.", "COMPLETION_NOT_FOUND");
  }
  const pending = await runRecoveryCommand(workspaceRoot, ["status", "--porcelain"], "read");
  if (pending.trim().length > 0) {
    throw new RecoveryError(
      "The workspace has changes that are not part of a completion yet.",
      "WORKSPACE_NOT_SEALED",
    );
  }
  // Rewind the workspace to the completion's exact state and seal the move as
  // its own entry, so the completions moved through stay reachable in history.
  const revision = Buffer.from(
    completion.id.slice(COMPLETION_ID_PREFIX.length),
    "base64url",
  ).toString("hex");
  await runRecoveryCommand(workspaceRoot, ["read-tree", "--reset", "-u", revision], "write");
  await runRecoveryCommand(
    workspaceRoot,
    [
      ...RECOVERY_AUTHOR_FLAGS,
      "commit",
      "--quiet",
      "--no-verify",
      "--allow-empty",
      "-m",
      RESTORE_SUBJECT,
    ],
    "write",
  );
  return completion;
}

export async function listCompletions(workspaceRootInput: string): Promise<Completion[]> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  await loadWorkspaceConfig(workspaceRoot);
  if (!(await hasRecoverySubstrate(workspaceRoot))) {
    return [];
  }

  if ((await revisionCount(workspaceRoot)) === 0) {
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
      id: `${COMPLETION_ID_PREFIX}${Buffer.from(revision, "hex").toString("base64url")}`,
      subject: fields[index + 1] ?? "",
      judgment: fields[index + 2]?.trim() ?? "",
    });
  }

  const baseline = revisions.findIndex((revision) => revision.subject === INITIAL_RECOVERY_SUBJECT);
  return baseline === -1
    ? []
    : revisions
        .slice(0, baseline)
        .filter((revision) => revision.subject !== RESTORE_SUBJECT)
        .map(({ id, judgment }) => ({ id, judgment }));
}

async function revisionCount(workspaceRoot: string): Promise<number> {
  const count = await runRecoveryCommand(workspaceRoot, ["rev-list", "--all", "--count"], "read");
  return Number.parseInt(count.trim(), 10) || 0;
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
  action: RecoveryAction,
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
    const failure = RECOVERY_FAILURE[action];
    throw new RecoveryError(failure.message, failure.code);
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
