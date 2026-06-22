import {
  GraphWorkspaceError,
  ReadWorkspaceError,
  WorkspaceInitError,
  WorkspaceResolutionError,
} from "@okf-harness/core";
import type { CliIo, JsonEnvelope } from "../types.js";

export type NormalizedCliError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function handleCliError(
  error: unknown,
  io: CliIo,
  options: { command: string; json: boolean; capturedStderr: string },
): number {
  if (error instanceof WorkspaceInitError) {
    writeCliError(io, {
      command: "init",
      error,
      json: options.json,
    });
    return 1;
  }

  if (error instanceof WorkspaceResolutionError) {
    writeCliError(io, {
      command: options.command,
      error,
      workspace: null,
      next: ["Run from inside an OKF Harness workspace or pass --workspace <path>."],
      json: options.json,
    });
    return 1;
  }

  if (isCommanderError(error)) {
    if (options.json) {
      writeCliError(io, {
        command: options.command,
        error: {
          code: error.code,
          message: error.message,
        },
        json: true,
      });
    } else {
      io.writeErr(options.capturedStderr);
    }
    return error.exitCode;
  }

  writeCliError(io, {
    command: "unknown",
    error: {
      code: "UNKNOWN",
      message: error instanceof Error ? error.message : "Unknown error.",
    },
    json: options.json,
  });
  return 5;
}

export function writeCliError(
  io: CliIo,
  options: {
    command: string;
    error: unknown;
    workspace?: string | null | undefined;
    next?: string[] | undefined;
    json?: boolean | undefined;
  },
): boolean {
  const normalized = normalizeCliError(options.error);
  if (normalized === undefined) {
    return false;
  }

  const envelope: JsonEnvelope = {
    ok: false,
    command: options.command,
    data: {},
    warnings: [],
    error: normalized,
    next: options.next ?? [],
  };
  if (options.workspace !== undefined) {
    envelope.workspace = options.workspace;
  }
  if (options.json === true) {
    io.writeErr(`${JSON.stringify(envelope)}\n`);
  } else {
    io.writeErr(renderHumanError(normalized.message, options.next ?? []));
  }
  return true;
}

export function writeValidationError(
  io: CliIo,
  options: {
    command: string;
    code: string;
    message: string;
    workspace?: string | null | undefined;
    details?: Record<string, unknown> | undefined;
    next?: string[] | undefined;
    json?: boolean | undefined;
  },
): void {
  writeCliError(io, {
    command: options.command,
    error:
      options.details === undefined
        ? {
            code: options.code,
            message: options.message,
          }
        : {
            code: options.code,
            message: options.message,
            details: options.details,
          },
    workspace: options.workspace,
    next: options.next ?? [],
    json: options.json,
  });
}

function renderHumanError(message: string, next: string[]): string {
  const nextStep = next[0];
  return nextStep === undefined ? `${message}\n` : `${message}\nNext: ${nextStep}\n`;
}

function normalizeCliError(error: unknown): NormalizedCliError | undefined {
  if (isNormalizedCliError(error)) {
    return normalizeObject(error);
  }
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

function normalizeObject(error: NormalizedCliError): NormalizedCliError {
  return {
    code: error.code,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
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

function isNormalizedCliError(error: unknown): error is NormalizedCliError {
  if (!isErrorWithCode(error)) {
    return false;
  }

  const candidate = error as { details?: unknown };
  return candidate.details === undefined || isRecord(candidate.details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
