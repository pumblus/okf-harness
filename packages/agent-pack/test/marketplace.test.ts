import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { renderBootstrapAgent, renderPortableAgent } from "../src/index.js";
import { bootstrapAgentProfiles } from "../src/profiles.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
const agentPluginRoot = "plugins/agent-plugins/okf-harness";
const agentPluginSchemaPath = "vendor/agent-plugins/1.0.0/plugin.schema.json";
const agentPluginSchemaSource = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

// The Codex storefront block, moved verbatim from the removed
// .codex-plugin/plugin.json into the manifest's com.openai extension.
const codexStorefront = {
  displayName: "OKF Harness",
  shortDescription: "Set up and maintain OKF Harness workspaces from Codex.",
  longDescription:
    "Adds the unified okf-harness skill for workspace setup and daily maintenance through the pinned runtime launcher.",
  developerName: "OKF Harness",
  category: "Productivity",
  capabilities: ["Write"],
  websiteURL: "https://github.com/pumblus/okf-harness",
  defaultPrompt: ["$okf-harness Set up a workspace for my notes."],
};

describe("native marketplace plugins", () => {
  it("publishes Claude Code and Codex marketplaces under okf-harness@okf-harness", async () => {
    const { version } = await readJson<{ version: string }>(packageJsonPath);
    const claudeMarketplace = await readRepoJson<ClaudeMarketplace>(
      ".claude-plugin/marketplace.json",
    );
    const codexMarketplace = await readRepoJson<CodexMarketplace>(
      ".agents/plugins/marketplace.json",
    );

    expect(claudeMarketplace).toMatchObject({
      name: "okf-harness",
      version,
      plugins: [
        {
          name: "okf-harness",
          source: "./plugins/claude/okf-harness",
          description: expect.stringContaining("unified okf-harness"),
          version,
        },
      ],
    });
    expect(JSON.stringify(claudeMarketplace)).not.toContain("okf-harness-bootstrap");
    expect(JSON.stringify(claudeMarketplace)).not.toContain("Requires okfh");
    expect(codexMarketplace).toEqual({
      name: "okf-harness",
      interface: {
        displayName: "OKF Harness",
      },
      plugins: [
        {
          name: "okf-harness",
          source: {
            source: "local",
            path: "./plugins/agent-plugins/okf-harness",
          },
          policy: {
            installation: "AVAILABLE",
            authentication: "ON_INSTALL",
          },
          category: "Productivity",
        },
      ],
    });
  });

  it("ships only the generated unified host skill in the Claude Code plugin package", async () => {
    const { version } = await readJson<{ version: string }>(packageJsonPath);

    await expectHostPlugin({
      root: "plugins/claude/okf-harness",
      manifestPath: ".claude-plugin/plugin.json",
      agent: "claude",
      version,
    });
  });

  it("ships one standards-conforming Agent Plugin package", async () => {
    const { version } = await readJson<{ version: string }>(packageJsonPath);
    const manifest = await readRepoJson<AgentPluginManifest>(
      path.join(agentPluginRoot, "plugin.json"),
    );
    const schema = await readRepoJson<AnySchema>(agentPluginSchemaPath);

    // Conformance assertion block: the manifest must validate against the
    // official Agent Plugins 1.0.0 schema, vendored so the check is offline
    // and deterministic. A break here is a conformance break, never a
    // marketplace break.
    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(
      validate(manifest),
      `the Agent Plugin manifest must conform to the official schema vendored at ${agentPluginSchemaPath} (source: ${agentPluginSchemaSource}); validation errors: ${JSON.stringify(validate.errors)}`,
    ).toBe(true);

    expect(manifest).toMatchObject({
      $schema: agentPluginSchemaSource,
      name: "okf-harness",
      version,
      license: "Apache-2.0",
    });
    expect(manifest).not.toHaveProperty("skills");
    expect(manifest.keywords).not.toContain("codex");
    expect(Object.keys(manifest.extensions)).toEqual(["com.openai"]);
    expect(manifest.extensions["com.openai"]).toEqual({ interface: codexStorefront });

    const expectedSkillFiles = renderPortableAgent({
      version,
    }).files.sort((left, right) => left.path.localeCompare(right.path));
    const actualFiles = await readRepoFiles(agentPluginRoot);

    expect(actualFiles.map((file) => file.path)).toEqual(
      ["plugin.json", "README.md", ...expectedSkillFiles.map((file) => file.path)].sort(
        (left, right) => left.localeCompare(right),
      ),
    );
    expect(actualFiles.filter((file) => file.path.startsWith("skills/"))).toEqual(
      expectedSkillFiles,
    );
    expect(actualFiles.filter((file) => file.path.endsWith("plugin.json"))).toHaveLength(1);
    expect(actualFiles.some((file) => file.path.startsWith(".codex-plugin"))).toBe(false);

    const readme = actualFiles.find((file) => file.path === "README.md")?.contents;
    expect(readme).toMatch(/^# /m);
    expect(readme).toContain("OKF Harness");
    expect(readme).toContain("Agent Plugin");

    expectUnifiedHostSkill(
      actualFiles.find((file) => file.path === "skills/okf-harness/SKILL.md")?.contents,
    );
    await expectPortableSkill(actualFiles, version);

    // The old Codex-private location is gone; only the Agent Plugin and the
    // untouched Claude Code package remain.
    const pluginDirs = (await readdir(path.join(repoRoot, "plugins")))
      .filter((entry) => !entry.startsWith("."))
      .sort();
    expect(pluginDirs).toEqual(["agent-plugins", "claude"]);
  });
});

async function expectHostPlugin(options: {
  root: string;
  manifestPath: string;
  agent: "claude" | "codex";
  version: string;
}): Promise<void> {
  const manifest = await readRepoJson<PluginManifest>(
    path.join(options.root, options.manifestPath),
  );
  expect(manifest).toMatchObject({
    name: "okf-harness",
    version: options.version,
    skills: "./skills/",
  });
  expect(JSON.stringify(manifest)).not.toMatch(/npm install|-g @okf-harness\/cli/);

  const expectedSkillFiles = renderBootstrapAgent({
    agent: options.agent,
    version: options.version,
  }).files.sort((left, right) => left.path.localeCompare(right.path));
  const actualFiles = await readRepoFiles(options.root);

  expect(actualFiles.map((file) => file.path)).toEqual(
    [options.manifestPath, ...expectedSkillFiles.map((file) => file.path)].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
  expect(actualFiles.filter((file) => file.path.startsWith("skills/"))).toEqual(expectedSkillFiles);

  expectUnifiedHostSkill(
    actualFiles.find((file) => file.path === "skills/okf-harness/SKILL.md")?.contents,
  );
}

function expectUnifiedHostSkill(skill: string | undefined): void {
  expect(skill).toContain("name: okf-harness");
  expect(skill).toContain('okf-harness-entrypoint: "host"');
  expect(skill).toContain("npx @okf-harness/setup@latest launch");
  expect(skill).toContain("check --json");
  expect(skill).not.toContain("If `okfh` is missing");
  expect(skill).not.toContain("npm install -g @okf-harness/cli");
  expect(skill).not.toContain("name: okf-harness-bootstrap");
}

async function expectPortableSkill(
  files: Array<{ path: string; contents: string }>,
  version: string,
): Promise<void> {
  const skill = files.find((file) => file.path === "skills/okf-harness/SKILL.md")?.contents;
  const setup = files.find(
    (file) => file.path === "skills/okf-harness/references/setup.md",
  )?.contents;
  const discovery = files.find(
    (file) => file.path === "skills/okf-harness/references/discovery.md",
  )?.contents;
  const repair = files.find(
    (file) => file.path === "skills/okf-harness/references/repair.md",
  )?.contents;

  // The portable skill is a render target, never an install target: it keeps
  // the host entrypoint contract and carries no client identity.
  expect(skill).toContain(`okf-harness-version: "${version}"`);
  expect(skill).toContain('okf-harness-managed: "true"');
  expect(skill).toContain('okf-harness-entrypoint: "host"');
  expect(skill).toContain('okf-harness-distribution: "portable"');
  expect(skill).not.toContain("okf-harness-agent");
  const frontmatter = skill?.slice(0, skill.indexOf("\n---", "---\n".length));
  expect(frontmatter).not.toMatch(/Codex|Claude Code/);
  expect(skill).toContain(
    "compatibility: Designed for any client that loads Agent Skills and can run local shell commands with npx access. The Harness runtime is resolved through the launcher.",
  );

  // Description is the only text loaded at startup, so the trigger words and
  // exclusions must match the host-specific variants word for word.
  const portableDescription = skill?.match(/^description: (.+)$/m)?.[1];
  expect(portableDescription).toMatch(/^Unified OKF Harness entrypoint\. /);
  for (const agent of ["codex", "claude"] as const) {
    const hostDescription = bootstrapAgentProfiles[agent].description;
    expect(portableDescription?.slice(portableDescription.indexOf("Use when"))).toBe(
      hostDescription.slice(hostDescription.indexOf("Use when")),
    );
  }

  // The setup and repair references carry the self-report determination with
  // the --agents none fallback and never hard-code an adapter identifier in a
  // command that would run.
  expect(setup).toContain("Set the agent target from **self-report** alone");
  expect(setup).toContain("Any other client: `--agents none`");
  expect(setup).not.toContain("The current agent is `");
  const setupCommands = setup?.slice(
    setup.indexOf("## Allowed Commands"),
    setup.indexOf("## Allowed Writes"),
  );
  expect(setupCommands).toContain("--agents <agent-target> --dry-run --json");
  expect(setupCommands).toContain("--agents <agent-target> --json");
  expect(setupCommands).not.toMatch(/--agents (?:codex|claude)/);
  expect(setup).toContain(
    "Workspace-local guidance created by the runtime's `init --agents <agent-target>` operation, when the agent target is not `none`.",
  );

  expect(discovery).toContain("redirect to the okf-harness skill or the repair route");
  expect(discovery).toContain(
    "hand off to repair when workspace-local guidance for the current agent is missing or stale",
  );

  // `agent install` accepts no none target, so the repair route must report
  // that an unrecognized client has nothing to install and fall back to daily
  // routing instead of proposing a command that cannot run.
  expect(repair).toContain(
    "Any other client has no managed guidance target: report that, and continue with the daily routes through the launcher.",
  );
  expect(repair).toContain(
    "Repair the self-reported agent only, and add another agent when the user names it.",
  );
  expect(repair).toContain("agent install <agent-target> --json");
  expect(repair).not.toMatch(/agent install (?:codex|claude)/);
  expect(repair).toContain("continue through the okf-harness skill");
}

async function readRepoJson<T>(relativePath: string): Promise<T> {
  return readJson<T>(path.join(repoRoot, relativePath));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readRepoFiles(
  rootRelativePath: string,
): Promise<Array<{ path: string; contents: string }>> {
  const root = path.join(repoRoot, rootRelativePath);
  const files = await readFiles(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function readFiles(
  root: string,
  current = root,
): Promise<Array<{ path: string; contents: string }>> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        return readFiles(root, entryPath);
      }
      return [
        {
          path: path.relative(root, entryPath).split(path.sep).join(path.posix.sep),
          contents: await readFile(entryPath, "utf8"),
        },
      ];
    }),
  );
  return files.flat();
}

type ClaudeMarketplace = {
  name: string;
  version: string;
  plugins: Array<{ name: string; source: string; version: string }>;
};

type CodexMarketplace = {
  name: string;
  interface: { displayName: string };
  plugins: Array<{
    name: string;
    source: { source: string; path: string };
    policy: { installation: string; authentication: string };
    category: string;
  }>;
};

type PluginManifest = {
  name: string;
  version: string;
  skills: string;
};

type AgentPluginManifest = {
  $schema: string;
  name: string;
  version: string;
  description: string;
  author: { name: string; url: string };
  homepage: string;
  repository: string;
  license: string;
  keywords: string[];
  extensions: Record<string, { interface: unknown }>;
};
