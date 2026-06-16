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
  const command = argv.slice(2).find((arg) => !arg.startsWith("-"));
  return command ?? "unknown";
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
