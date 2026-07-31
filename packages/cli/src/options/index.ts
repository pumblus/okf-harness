import type { AgentInstallTarget } from "@okf-harness/agent-pack";

export type InitAgentTarget = AgentInstallTarget | "none";

export function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected an integer option value, received: ${value}`);
  }
  return parsed;
}

export function commandFromArgv(argv: string[]): string {
  const args = argv.slice(2);
  const commandIndex = args.findIndex((arg) => !arg.startsWith("-"));
  const command = args[commandIndex];
  if (command === undefined) {
    return "unknown";
  }
  const action = args[commandIndex + 1];
  return ["agent", "bootstrap", "ingest", "source"].includes(command) &&
    action !== undefined &&
    !action.startsWith("-")
    ? `${command} ${action}`
    : command;
}

export function parseAgentInstallTarget(input: string): AgentInstallTarget | undefined {
  if (input === "claude" || input === "codex" || input === "all") {
    return input;
  }
  return undefined;
}

export function parseInitAgentTarget(input: string): InitAgentTarget | undefined {
  if (input === "none") {
    return "none";
  }
  if (input === "claude,codex" || input === "codex,claude") {
    return "all";
  }
  return parseAgentInstallTarget(input);
}
