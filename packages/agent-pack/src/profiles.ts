import { nativeIntegrationProfile } from "./integrations.js";

export const agentAdapters = ["claude", "codex"] as const;
export type AgentAdapter = (typeof agentAdapters)[number];
export type AgentInstallTarget = AgentAdapter | "all";

export const bootstrapAgents = ["codex", "claude"] as const;
export type BootstrapAgent = (typeof bootstrapAgents)[number];

export const skillName = "okf-harness";
export const hostSkillName = skillName;
export const skillDescription =
  "One Door workflow for OKF Harness workspaces. Use when the user asks to set up, check, ingest into, reconcile revisions in, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, ordinary repository maintenance, knowledge-base tasks outside an OKF Harness workspace, repository dependency graphs, old workflow-specific skill names, or an `okfh query` command.";

export const referenceTemplatePaths = [
  "setup.md",
  "check.md",
  "ingest.md",
  "reconcile.md",
  "answer.md",
  "graph.md",
] as const;
export const bootstrapReferenceTemplatePaths = ["setup.md", "discovery.md", "repair.md"] as const;
export const oldWorkflowSkillNames = [
  "okf-harness-init",
  "okf-harness-ingest",
  "okf-harness-query",
  "okf-harness-maintain",
] as const;

export type AdapterProfile = {
  rootGuidancePath: string;
  routePrefix: string;
  routeLabel: string;
  skillRoot: string;
};

export const adapterProfiles: Record<AgentAdapter, AdapterProfile> = {
  claude: {
    rootGuidancePath: "CLAUDE.md",
    routePrefix: "/",
    routeLabel: "Use the project skills for user-facing workflows:",
    skillRoot: ".claude/skills",
  },
  codex: {
    rootGuidancePath: "AGENTS.md",
    routePrefix: "$",
    routeLabel: "Use repo skills for workflows:",
    skillRoot: ".agents/skills",
  },
};

export type BootstrapAgentProfile = {
  command: string;
  label: string;
  routePrefix: string;
  targetDirectoryEnv?: string;
  targetDirectory: string;
  stateDirectoryEnv: string;
  stateDirectory: string;
  sessionName: string;
  compatibility: string;
  description: string;
};

const codexIntegration = nativeIntegrationProfile("codex");
const claudeIntegration = nativeIntegrationProfile("claude");

export const bootstrapAgentProfiles: Record<BootstrapAgent, BootstrapAgentProfile> = {
  codex: {
    command: codexIntegration.command,
    label: codexIntegration.label,
    routePrefix: "$",
    targetDirectory: ".agents",
    stateDirectoryEnv: "CODEX_HOME",
    stateDirectory: ".codex",
    sessionName: "Codex thread",
    compatibility:
      "Designed for Codex with local shell and npx access. The Harness runtime is resolved through the launcher.",
    description:
      "Unified OKF Harness entrypoint for Codex. Use when the user asks to create, find, select, repair, check, ingest into, reconcile, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, repository maintenance, repository dependency graphs, or non-OKF knowledge-base work.",
  },
  claude: {
    command: claudeIntegration.command,
    label: claudeIntegration.label,
    routePrefix: "/",
    targetDirectoryEnv: "CLAUDE_CONFIG_DIR",
    targetDirectory: ".claude",
    stateDirectoryEnv: "CLAUDE_CONFIG_DIR",
    stateDirectory: ".claude",
    sessionName: "Claude Code session",
    compatibility:
      "Designed for Claude Code with local shell and npx access. The Harness runtime is resolved through the launcher.",
    description:
      "Unified OKF Harness entrypoint for Claude Code. Use when the user asks to create, find, select, repair, check, ingest into, reconcile, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, repository maintenance, repository dependency graphs, or non-OKF knowledge-base work.",
  },
};
