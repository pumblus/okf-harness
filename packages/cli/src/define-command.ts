import { resolveWorkspaceRoot } from "@okf-harness/core";
import type { Command } from "commander";
import { writeCliError } from "./errors/index.js";
import { registerHumanRenderer, writeResult } from "./render/result.js";
import type { CliIo, JsonEnvelope } from "./types.js";

export type CommandOption = {
  flags: string;
  description: string;
  parse?: ((value: string) => unknown) | undefined;
};

export type CommandRunResult = {
  data: unknown;
  warnings: JsonEnvelope["warnings"];
  next: string[];
};

/**
 * One declaration for a command whose envelope lifecycle `defineCommand`
 * owns end to end: commander registration, workspace resolution, envelope
 * assembly, json/human output, error writing, and exit codes. The JSON
 * contract is the command envelope bound by ADR-0001 and ADR-0037.
 */
export type CommandDeclaration = {
  /** Commander template, e.g. "search <query>". */
  command: string;
  /** Commander description. */
  description: string;
  /** Extra options beyond the default --workspace and --json. */
  options?: CommandOption[] | undefined;
  /** Runs the command against a resolved workspace; returns the envelope data. */
  run: (
    args: string[],
    options: Record<string, unknown>,
    workspaceRoot: string,
  ) => Promise<CommandRunResult>;
  /** Error next-step hints; a function receives the caught error. Defaults to a synthesized hint. */
  errorNext?: (string[] | ((error: unknown) => string[])) | undefined;
  /** Optional human-readable renderer, registered into the command-name table. */
  human?: ((envelope: JsonEnvelope) => string) | undefined;
};

export function defineCommand(
  program: Command,
  io: CliIo,
  setExitCode: (code: number) => void,
  declaration: CommandDeclaration,
): void {
  const command = program.command(declaration.command).description(declaration.description);
  const commandName = command.name();
  command.storeOptionsAsProperties(false);
  command.option("--workspace <path>", "workspace path");
  for (const option of declaration.options ?? []) {
    command.option(option.flags, option.description, option.parse);
  }
  command.option("--json", "write machine-readable JSON");
  if (declaration.human !== undefined) {
    registerHumanRenderer(commandName, declaration.human);
  }

  command.action(async (...actionArgs: unknown[]) => {
    // commander 4.x passes (positional args..., command) to the action handler.
    const actionCommand = actionArgs[actionArgs.length - 1] as Command;
    const args = actionArgs.slice(0, -1) as string[];
    const options = actionCommand.opts() as Record<string, unknown>;
    let workspaceRoot: string | null = null;
    try {
      workspaceRoot = await resolveWorkspaceRoot({
        workspaceRoot: options.workspace as string | undefined,
      });
      const result = await declaration.run(args, options, workspaceRoot);
      writeResult(
        io,
        {
          ok: true,
          command: commandName,
          workspace: workspaceRoot,
          data: result.data,
          warnings: result.warnings,
          next: result.next,
        },
        options.json === true,
      );
      setExitCode(0);
    } catch (error) {
      const next = resolveErrorNext(declaration, error, commandName);
      const handled = writeCliError(io, {
        command: commandName,
        error,
        workspace: workspaceRoot,
        next,
        json: options.json === true,
      });
      if (handled) {
        setExitCode(1);
        return;
      }
      // Rethrow so the top-level handler keeps producing UNKNOWN and exit 5.
      throw error;
    }
  });
}

function resolveErrorNext(
  declaration: CommandDeclaration,
  error: unknown,
  commandName: string,
): string[] {
  const next = declaration.errorNext;
  if (next === undefined) {
    return [`Check the workspace path and rerun okfh ${commandName} --json.`];
  }
  return typeof next === "function" ? next(error) : next;
}
