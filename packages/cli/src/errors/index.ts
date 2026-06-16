import {
  GraphWorkspaceError,
  ReadWorkspaceError,
  WorkspaceInitError,
  WorkspaceResolutionError,
} from "@okf-harness/core";
import type { CliIo, JsonEnvelope } from "../types.js";

export function handleCliError(
  error: unknown,
  io: CliIo,
  options: { command: string; json: boolean; capturedStderr: string },
): number {
  if (error instanceof WorkspaceInitError) {
    writeError(io, "init", error.message, error.code);
    return 1;
  }

  if (error instanceof WorkspaceResolutionError) {
    if (options.json) {
      writePhase5Error(io, {
        command: options.command,
        error,
        workspace: null,
        next: ["Run from inside an OKF Harness workspace or pass --workspace <path>."],
        json: true,
      });
    } else {
      io.writeErr(`${error.message}\n`);
    }
    return 1;
  }

  if (isCommanderError(error)) {
    if (options.json) {
      writeError(io, options.command, error.message, error.code);
    } else {
      io.writeErr(options.capturedStderr);
    }
    return error.exitCode;
  }

  writeError(io, "unknown", error instanceof Error ? error.message : "Unknown error.", "UNKNOWN");
  return 5;
}

export function writeError(
  io: CliIo,
  command: string,
  message: string,
  code: string,
  workspace?: string,
): void {
  const envelope: JsonEnvelope = {
    ok: false,
    command,
    data: {
      code,
      message,
    },
    warnings: [],
    next: [],
  };
  if (workspace !== undefined) {
    envelope.workspace = workspace;
  }
  io.writeErr(`${JSON.stringify(envelope)}\n`);
}

export function writePhase5Error(
  io: CliIo,
  options: {
    command: string;
    error: unknown;
    workspace: string | null;
    next: string[];
    json?: boolean | undefined;
  },
): boolean {
  const normalized = normalizePhase5Error(options.error);
  if (normalized === undefined) {
    return false;
  }

  const envelope: JsonEnvelope = {
    ok: false,
    command: options.command,
    workspace: options.workspace,
    data: {},
    warnings: [],
    error: normalized,
    next: options.next,
  };
  if (options.json === true) {
    io.writeErr(`${JSON.stringify(envelope)}\n`);
  } else {
    io.writeErr(renderHumanError(normalized.message, options.next));
  }
  return true;
}

function renderHumanError(message: string, next: string[]): string {
  const nextStep = next[0];
  return nextStep === undefined ? `${message}\n` : `${message}\nNext: ${nextStep}\n`;
}

function normalizePhase5Error(error: unknown):
  | {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }
  | undefined {
  if (error instanceof WorkspaceResolutionError) {
    return {
      code: error.code,
      message: error.message,
      details: { startDir: error.startDir },
    };
  }
  if (error instanceof ReadWorkspaceError) {
    const normalized = {
      code: error.code,
      message: error.message,
    };
    return Object.keys(error.details).length > 0
      ? { ...normalized, details: error.details }
      : normalized;
  }
  if (error instanceof GraphWorkspaceError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  if (isErrorWithCode(error)) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  return undefined;
}

function isCommanderError(
  error: unknown,
): error is { code: string; exitCode: number; message: string } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; exitCode?: unknown; message?: unknown };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.exitCode === "number" &&
    typeof candidate.message === "string"
  );
}

function isErrorWithCode(error: unknown): error is { code: string; message: string } {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}
