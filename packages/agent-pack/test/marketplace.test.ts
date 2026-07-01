import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderBootstrapAgent } from "../src/index.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));

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
          version,
        },
      ],
    });
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
            path: "./plugins/codex/okf-harness",
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

  it("ships only the generated bootstrap skill in host plugin packages", async () => {
    const { version } = await readJson<{ version: string }>(packageJsonPath);

    await expectHostPlugin({
      root: "plugins/claude/okf-harness",
      manifestPath: ".claude-plugin/plugin.json",
      agent: "claude",
      version,
    });
    await expectHostPlugin({
      root: "plugins/codex/okf-harness",
      manifestPath: ".codex-plugin/plugin.json",
      agent: "codex",
      version,
    });
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

  const skill = actualFiles.find(
    (file) => file.path === "skills/okf-harness-bootstrap/SKILL.md",
  )?.contents;
  expect(skill).toContain("name: okf-harness-bootstrap");
  expect(skill).toContain("If `okfh` is missing");
  expect(skill).toContain("npm install -g @okf-harness/cli");
  expect(skill).toContain("okfh doctor --json");
  expect(skill).not.toContain("npx @okf-harness/setup@latest");
  expect(skill).not.toContain("name: okf-harness\n");
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
