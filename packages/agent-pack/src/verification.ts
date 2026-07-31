import type { NativeInstallCommand, NativeIntegrationId } from "./integrations.js";

export type NativeIntegrationVerificationOutcome = "verified" | "failed" | "unavailable";

export type NativeIntegrationVerificationReason =
  | "integration-verified"
  | "integration-not-installed"
  | "integration-disabled"
  | "integration-identity-mismatch"
  | "integration-errors-reported"
  | "probe-command-unavailable"
  | "probe-command-failed"
  | "probe-output-incompatible";

export type NativeIntegrationProbeResult = {
  stdout: string;
  exitCode?: number;
};

export type NativeIntegrationVerificationResult = {
  outcome: NativeIntegrationVerificationOutcome;
  reason: NativeIntegrationVerificationReason;
  expectedIdentity: string;
  exitCode?: number;
};

type ParsedVerification = Pick<NativeIntegrationVerificationResult, "outcome" | "reason">;

export type NativeIntegrationVerificationDefinition = {
  commands: readonly NativeInstallCommand[];
  expectedIdentity: string;
  parse: (stdout: readonly string[]) => ParsedVerification;
};

class IncompatibleProbeOutput extends Error {}

const verified = (): ParsedVerification => ({
  outcome: "verified",
  reason: "integration-verified",
});

const failed = (
  reason: Exclude<
    NativeIntegrationVerificationReason,
    | "integration-verified"
    | "probe-command-unavailable"
    | "probe-command-failed"
    | "probe-output-incompatible"
  >,
): ParsedVerification => ({ outcome: "failed", reason });

function unavailable(
  definition: NativeIntegrationVerificationDefinition,
  reason: Extract<
    NativeIntegrationVerificationReason,
    "probe-command-unavailable" | "probe-command-failed" | "probe-output-incompatible"
  >,
  exitCode?: number,
): NativeIntegrationVerificationResult {
  return {
    outcome: "unavailable",
    reason,
    expectedIdentity: definition.expectedIdentity,
    ...(exitCode === undefined ? {} : { exitCode }),
  };
}

export function verifyNativeIntegration(
  definition: NativeIntegrationVerificationDefinition,
  probeResults: readonly NativeIntegrationProbeResult[],
): NativeIntegrationVerificationResult {
  for (let index = 0; index < definition.commands.length; index += 1) {
    const result = probeResults[index];
    if (result === undefined || result.exitCode === undefined) {
      return unavailable(definition, "probe-command-unavailable");
    }
    if (result.exitCode !== 0) {
      return unavailable(definition, "probe-command-failed", result.exitCode);
    }
  }
  if (probeResults.length !== definition.commands.length) {
    return unavailable(definition, "probe-output-incompatible");
  }

  try {
    return {
      ...definition.parse(probeResults.map((result) => result.stdout)),
      expectedIdentity: definition.expectedIdentity,
    };
  } catch {
    return unavailable(definition, "probe-output-incompatible");
  }
}

function parseClaude(stdout: readonly string[]): ParsedVerification {
  const marketplaces = jsonArray(stdout[0]);
  const plugins = jsonArray(stdout[1]);
  const marketplaceRecords = marketplaces.map((value) => record(value));
  const pluginRecords = plugins.map((value) => record(value));

  for (const marketplace of marketplaceRecords) {
    requiredString(marketplace, "name");
    if (requiredString(marketplace, "source") === "github") {
      requiredString(marketplace, "repo");
    }
  }
  for (const plugin of pluginRecords) {
    requiredString(plugin, "id");
    requiredBoolean(plugin, "enabled");
  }

  const namedMarketplace = marketplaceRecords.find(
    (marketplace) => marketplace.name === "okf-harness",
  );
  const canonicalMarketplace = marketplaceRecords.find(
    (marketplace) =>
      marketplace.name === "okf-harness" &&
      marketplace.source === "github" &&
      normalizeGitHubRepository(marketplace.repo) === "pumblus/okf-harness",
  );
  const plugin = pluginRecords.find((entry) => entry.id === "okf-harness@okf-harness");

  if (canonicalMarketplace === undefined) {
    return namedMarketplace === undefined && plugin === undefined
      ? failed("integration-not-installed")
      : failed("integration-identity-mismatch");
  }
  if (plugin === undefined) {
    return failed("integration-not-installed");
  }
  if (plugin.enabled !== true) {
    return failed("integration-disabled");
  }
  if (reportsPluginErrors(plugin)) {
    return failed("integration-errors-reported");
  }
  return verified();
}

function parseCodex(stdout: readonly string[]): ParsedVerification {
  const root = jsonRecord(stdout[0]);
  const installed = requiredArray(root, "installed").map((value) => record(value));
  const plugin = installed.find((entry) => entry.pluginId === "okf-harness@okf-harness");
  if (plugin === undefined) {
    return failed("integration-not-installed");
  }

  requiredString(plugin, "pluginId");
  requiredString(plugin, "marketplaceName");
  requiredBoolean(plugin, "installed");
  requiredBoolean(plugin, "enabled");
  const marketplaceSource = record(plugin.marketplaceSource);
  const source = requiredString(marketplaceSource, "source");
  const sourceType = requiredString(marketplaceSource, "sourceType");

  if (
    plugin.marketplaceName !== "okf-harness" ||
    sourceType !== "git" ||
    normalizeGitHubRepository(source) !== "pumblus/okf-harness"
  ) {
    return failed("integration-identity-mismatch");
  }
  if (plugin.installed !== true) {
    return failed("integration-not-installed");
  }
  if (plugin.enabled !== true) {
    return failed("integration-disabled");
  }
  return verified();
}

function parseOpenCode(stdout: readonly string[]): ParsedVerification {
  const root = jsonRecord(stdout[0]);
  const plugins = requiredArray(root, "plugin").map(pluginSpecifier);
  if (!plugins.includes("@pumblus/okf-harness")) {
    return failed("integration-not-installed");
  }

  const origins = requiredArray(root, "plugin_origins").map((value) => record(value));
  const matchingOrigin = origins.find(
    (origin) => pluginSpecifier(origin.spec) === "@pumblus/okf-harness",
  );
  if (matchingOrigin === undefined || requiredString(matchingOrigin, "scope") !== "global") {
    return failed("integration-identity-mismatch");
  }
  return verified();
}

function parsePi(stdout: readonly string[]): ParsedVerification {
  const output = stripAnsi(stdout[0] ?? "")
    .replaceAll("\r\n", "\n")
    .trimEnd();
  if (output.trim() === "No packages installed.") {
    return failed("integration-not-installed");
  }

  const lines = output.split("\n");
  let section: "user" | "project" | undefined;
  let sawSection = false;
  let sawTarget = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "User packages:") {
      section = "user";
      sawSection = true;
      continue;
    }
    if (line.trim() === "Project packages:") {
      section = "project";
      sawSection = true;
      continue;
    }
    if (section !== "user") {
      continue;
    }

    const packageSource = line.trim().replace(/ \(filtered\)$/, "");
    if (packageSource !== "npm:@pumblus/okf-harness") {
      continue;
    }
    sawTarget = true;
    const installPath = (lines[index + 1] ?? "").trim();
    if (/(?:^|[\\/])node_modules[\\/]@pumblus[\\/]okf-harness[\\/]?$/.test(installPath)) {
      return verified();
    }
  }

  if (!sawSection) {
    throw new IncompatibleProbeOutput();
  }
  return failed(sawTarget ? "integration-identity-mismatch" : "integration-not-installed");
}

function parseHermes(stdout: readonly string[]): ParsedVerification {
  const snapshot = jsonRecord(stdout[0]);
  const skills = requiredArray(snapshot, "skills").map((value) => record(value));
  const taps = requiredArray(snapshot, "taps").map((value) => record(value));
  const discovery = jsonArray(stdout[1]).map((value) => record(value));

  for (const skill of skills) {
    requiredString(skill, "identifier");
  }
  for (const tap of taps) {
    requiredString(tap, "repo");
  }
  for (const skill of discovery) {
    requiredString(skill, "name");
    requiredString(skill, "identifier");
  }

  const hasTap = taps.some((tap) => tap.repo === "pumblus/okf-harness");
  const hasInstalledSkill = skills.some(
    (skill) => skill.identifier === "pumblus/okf-harness/okf-harness",
  );
  const hasDiscoveredSkill = discovery.some(
    (skill) =>
      skill.name === "okf-harness" && skill.identifier === "pumblus/okf-harness/okf-harness",
  );

  if (!hasTap && !hasInstalledSkill && !hasDiscoveredSkill) {
    return failed("integration-not-installed");
  }
  return hasTap && hasInstalledSkill && hasDiscoveredSkill
    ? verified()
    : failed("integration-identity-mismatch");
}

function parseOpenClaw(stdout: readonly string[]): ParsedVerification {
  const skill = jsonRecord(stdout[0]);
  if (skill.error === "not found") {
    return failed("integration-not-installed");
  }
  if (requiredString(skill, "name") !== "okf-harness") {
    return failed("integration-not-installed");
  }
  const source = requiredString(skill, "source");
  const clawhub = record(skill.clawhub);
  requiredString(clawhub, "status");
  requiredBoolean(clawhub, "valid");
  requiredString(clawhub, "ownerHandle");
  requiredString(clawhub, "slug");

  return source === "openclaw-managed" &&
    clawhub.status === "linked" &&
    clawhub.valid === true &&
    clawhub.ownerHandle === "pumblus" &&
    clawhub.slug === "okf-harness"
    ? verified()
    : failed("integration-identity-mismatch");
}

const definitions = {
  claude: {
    commands: [
      { command: "claude", args: ["plugin", "marketplace", "list", "--json"] },
      { command: "claude", args: ["plugin", "list", "--json"] },
    ],
    expectedIdentity:
      "GitHub marketplace pumblus/okf-harness with enabled, error-free plugin okf-harness@okf-harness",
    parse: parseClaude,
  },
  codex: {
    commands: [{ command: "codex", args: ["plugin", "list", "--json"] }],
    expectedIdentity:
      "enabled plugin okf-harness@okf-harness from GitHub marketplace pumblus/okf-harness",
    parse: parseCodex,
  },
  opencode: {
    commands: [{ command: "opencode", args: ["debug", "config", "--pure"] }],
    expectedIdentity: "global OpenCode plugin @pumblus/okf-harness",
    parse: parseOpenCode,
  },
  pi: {
    commands: [{ command: "pi", args: ["list", "--no-approve"] }],
    expectedIdentity:
      "user package npm:@pumblus/okf-harness installed under node_modules/@pumblus/okf-harness",
    parse: parsePi,
  },
  hermes: {
    commands: [
      { command: "hermes", args: ["skills", "snapshot", "export", "-"] },
      {
        command: "hermes",
        args: ["skills", "search", "okf-harness", "--source", "github", "--json"],
      },
    ],
    expectedIdentity:
      "tap pumblus/okf-harness with installed and discoverable skill pumblus/okf-harness/okf-harness",
    parse: parseHermes,
  },
  openclaw: {
    commands: [{ command: "openclaw", args: ["skills", "info", "okf-harness", "--json"] }],
    expectedIdentity: "openclaw-managed valid linked ClawHub skill @pumblus/okf-harness",
    parse: parseOpenClaw,
  },
} as const satisfies Record<NativeIntegrationId, NativeIntegrationVerificationDefinition>;

export function nativeIntegrationVerificationDefinition(
  id: NativeIntegrationId,
): NativeIntegrationVerificationDefinition {
  return definitions[id];
}

function jsonRecord(value: string | undefined): Record<string, unknown> {
  try {
    return record(JSON.parse(value ?? ""));
  } catch (error) {
    if (error instanceof IncompatibleProbeOutput) {
      throw error;
    }
    throw new IncompatibleProbeOutput();
  }
}

function jsonArray(value: string | undefined): unknown[] {
  try {
    const parsed = JSON.parse(value ?? "") as unknown;
    if (!Array.isArray(parsed)) {
      throw new IncompatibleProbeOutput();
    }
    return parsed;
  } catch (error) {
    if (error instanceof IncompatibleProbeOutput) {
      throw error;
    }
    throw new IncompatibleProbeOutput();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new IncompatibleProbeOutput();
  }
  return value as Record<string, unknown>;
}

function requiredArray(value: Record<string, unknown>, key: string): unknown[] {
  const entry = value[key];
  if (!Array.isArray(entry)) {
    throw new IncompatibleProbeOutput();
  }
  return entry;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const entry = value[key];
  if (typeof entry !== "string") {
    throw new IncompatibleProbeOutput();
  }
  return entry;
}

function requiredBoolean(value: Record<string, unknown>, key: string): boolean {
  const entry = value[key];
  if (typeof entry !== "boolean") {
    throw new IncompatibleProbeOutput();
  }
  return entry;
}

function pluginSpecifier(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  throw new IncompatibleProbeOutput();
}

function reportsPluginErrors(plugin: Record<string, unknown>): boolean {
  if ("errors" in plugin) {
    if (!Array.isArray(plugin.errors)) {
      throw new IncompatibleProbeOutput();
    }
    if (plugin.errors.length > 0) {
      return true;
    }
  }
  if (!("error" in plugin)) {
    return false;
  }
  if (typeof plugin.error !== "string") {
    throw new IncompatibleProbeOutput();
  }
  return plugin.error.length > 0;
}

function normalizeGitHubRepository(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const input = value.trim().replace(/\/$/, "");
  const match =
    /^(?:(?:https?:\/\/|ssh:\/\/git@)github\.com\/|git@github\.com:)?([^/]+\/[^/]+?)(?:\.git)?$/i.exec(
      input,
    );
  return match?.[1]?.toLowerCase();
}

function stripAnsi(value: string): string {
  const escapeCharacter = String.fromCharCode(27);
  return value.replace(new RegExp(`${escapeCharacter}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
}
