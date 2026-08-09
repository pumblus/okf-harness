import { nativeIntegrationProfile } from "./integrations.js";

export const agentAdapters = ["claude", "codex"] as const;
export type AgentAdapter = (typeof agentAdapters)[number];
export type AgentInstallTarget = AgentAdapter | "all";

export const bootstrapAgents = ["codex", "claude"] as const;
export type BootstrapAgent = (typeof bootstrapAgents)[number];

export type BootstrapDistribution = BootstrapAgent | "portable";

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

// The substitution values that turn the shared host-skill templates into one
// distribution form. The host-specific values reproduce the per-host wording;
// the portable profile is a render-only target that never installs.
export type BootstrapRenderProfile = {
  description: string;
  compatibility: string;
  intentAgent: string;
  inferSubjects: string;
  agentTargetClause: string;
  agentsTarget: string;
  guidanceWrite: string;
  workspaceInvocation: string;
  freshSession: string;
  repairIntent: string;
  repairAgentTargetClause: string;
  repairInvokedGuidance: string;
  currentGuidanceState: string;
  managedGuidance: string;
  guidanceMissingState: string;
};

export type BootstrapAgentProfile = BootstrapRenderProfile & {
  label: string;
  command: string;
  routePrefix: string;
  targetDirectoryEnv?: string;
  targetDirectory: string;
  stateDirectoryEnv: string;
  stateDirectory: string;
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
    compatibility:
      "Designed for Codex with local shell and npx access. The Harness runtime is resolved through the launcher.",
    description:
      "Unified OKF Harness entrypoint for Codex. Use when the user asks to create, find, select, repair, check, ingest into, reconcile, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, repository maintenance, repository dependency graphs, or non-OKF knowledge-base work.",
    intentAgent: " for Codex",
    inferSubjects: "the display name, target folder, and current agent",
    agentTargetClause:
      "The current agent is `codex`; use `--agents codex` unless the user explicitly asks for additional clients.",
    agentsTarget: "codex",
    guidanceWrite:
      "Codex workspace-local guidance created by the runtime's `init --agents codex` operation.",
    workspaceInvocation: "`$okf-harness`",
    freshSession: "a fresh Codex thread",
    repairIntent:
      "Install or repair Codex workspace-local guidance for a selected OKF Harness workspace.",
    repairAgentTargetClause: "Repair only Codex unless the user explicitly asks for another agent.",
    repairInvokedGuidance: "Codex workspace-local guidance",
    currentGuidanceState: "current Codex guidance",
    managedGuidance: "Codex workspace guidance",
    guidanceMissingState: "Codex workspace-local guidance",
  },
  claude: {
    command: claudeIntegration.command,
    label: claudeIntegration.label,
    routePrefix: "/",
    targetDirectoryEnv: "CLAUDE_CONFIG_DIR",
    targetDirectory: ".claude",
    stateDirectoryEnv: "CLAUDE_CONFIG_DIR",
    stateDirectory: ".claude",
    compatibility:
      "Designed for Claude Code with local shell and npx access. The Harness runtime is resolved through the launcher.",
    description:
      "Unified OKF Harness entrypoint for Claude Code. Use when the user asks to create, find, select, repair, check, ingest into, reconcile, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, repository maintenance, repository dependency graphs, or non-OKF knowledge-base work.",
    intentAgent: " for Claude Code",
    inferSubjects: "the display name, target folder, and current agent",
    agentTargetClause:
      "The current agent is `claude`; use `--agents claude` unless the user explicitly asks for additional clients.",
    agentsTarget: "claude",
    guidanceWrite:
      "Claude Code workspace-local guidance created by the runtime's `init --agents claude` operation.",
    workspaceInvocation: "`/okf-harness`",
    freshSession: "a fresh Claude Code session",
    repairIntent:
      "Install or repair Claude Code workspace-local guidance for a selected OKF Harness workspace.",
    repairAgentTargetClause:
      "Repair only Claude Code unless the user explicitly asks for another agent.",
    repairInvokedGuidance: "Claude Code workspace-local guidance",
    currentGuidanceState: "current Claude Code guidance",
    managedGuidance: "Claude Code workspace guidance",
    guidanceMissingState: "Claude Code workspace-local guidance",
  },
};

export const portableBootstrapProfile: BootstrapRenderProfile = {
  compatibility:
    "Designed for any client that loads Agent Skills and can run local shell commands with npx access. The Harness runtime is resolved through the launcher.",
  description:
    "Unified OKF Harness entrypoint. Use when the user asks to create, find, select, repair, check, ingest into, reconcile, answer from, or graph an OKF Harness workspace. Do not use for generic Markdown editing, repository maintenance, repository dependency graphs, or non-OKF knowledge-base work.",
  intentAgent: "",
  inferSubjects: "the display name and target folder",
  agentTargetClause:
    "Set the agent target from **self-report** alone — the client you know yourself to be. Claude Code: `--agents claude`. Codex: `--agents codex`. Any other client: `--agents none`, which creates the workspace without workspace-local guidance and leaves the repair route to add it later.",
  agentsTarget: "<agent-target>",
  guidanceWrite:
    "Workspace-local guidance created by the runtime's `init --agents <agent-target>` operation, when the agent target is not `none`.",
  workspaceInvocation: "the okf-harness skill",
  freshSession: "a fresh session",
  repairIntent:
    "Install or repair workspace-local guidance for the current agent in a selected OKF Harness workspace.",
  repairAgentTargetClause:
    // The embedded "\n- " renders the portable repair preconditions as two
    // bullets, matching the host variants' one-bullet slot for the same rule.
    "Set the agent target from **self-report** alone — the client you know yourself to be. Claude Code: repair `claude`. Codex: repair `codex`. Any other client has no managed guidance target: report that, and continue with the daily routes through the launcher.\n- Repair the self-reported agent only, and add another agent when the user names it.",
  repairInvokedGuidance: "the current agent's workspace-local guidance",
  currentGuidanceState: "current guidance for the agent target",
  managedGuidance: "workspace guidance for the agent target",
  guidanceMissingState: "workspace-local guidance for the current agent",
};

export function bootstrapDistributionProfile(
  distribution: BootstrapDistribution,
): BootstrapRenderProfile {
  if (distribution === "portable") {
    return portableBootstrapProfile;
  }
  return bootstrapAgentProfiles[distribution];
}
