import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export const PATH_OUTSIDE_WORKSPACE = "PATH_OUTSIDE_WORKSPACE" as const;

export class WorkspacePathError extends Error {
  readonly code = PATH_OUTSIDE_WORKSPACE;

  constructor(
    message: string,
    readonly workspaceRoot: string,
    readonly input: string,
  ) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

export type WorkspacePathResolution = {
  workspaceRoot: string;
  absolutePath: string;
  relativePath: string;
};

export function toPosixPath(input: string): string {
  return input.replace(/\\/g, "/");
}

export function toPosixRelativePath(from: string, to: string): string {
  return toPosixPath(path.relative(from, to));
}

export async function safeResolveWorkspacePath(
  workspaceRoot: string,
  input: string,
): Promise<WorkspacePathResolution> {
  if (input.trim().length === 0) {
    throw new WorkspacePathError("Workspace path input must not be empty.", workspaceRoot, input);
  }

  const requestedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedWorkspaceRoot = await realpathExistingPrefix(
    requestedWorkspaceRoot,
    requestedWorkspaceRoot,
    ".",
  );
  const candidate = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(resolvedWorkspaceRoot, input);
  const resolvedCandidate = await realpathExistingPrefix(candidate, resolvedWorkspaceRoot, input);

  if (!isPathInside(resolvedWorkspaceRoot, resolvedCandidate)) {
    throw new WorkspacePathError(
      `Path resolves outside workspace: ${input}`,
      resolvedWorkspaceRoot,
      input,
    );
  }

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    absolutePath: resolvedCandidate,
    relativePath: toPosixRelativePath(resolvedWorkspaceRoot, resolvedCandidate),
  };
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function realpathExistingPrefix(
  candidate: string,
  workspaceRoot: string,
  input: string,
): Promise<string> {
  const missingSegments: string[] = [];
  let current = candidate;

  while (true) {
    try {
      const existing = await realpath(current);
      return path.join(existing, ...missingSegments.reverse());
    } catch (error) {
      if (errorCode(error) === "ELOOP" || (await isSymbolicLink(current))) {
        throw new WorkspacePathError(
          `Path resolves outside workspace: ${input}`,
          workspaceRoot,
          input,
        );
      }
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(candidate);
      }

      missingSegments.push(path.basename(current));
      current = parent;
    }
  }
}

async function isSymbolicLink(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isSymbolicLink();
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
