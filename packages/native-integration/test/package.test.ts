import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../src/opencode.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const previousOpenCodeConfigDir = process.env.OPENCODE_CONFIG_DIR;

afterEach(() => {
  if (previousOpenCodeConfigDir === undefined) {
    delete process.env.OPENCODE_CONFIG_DIR;
    return;
  }
  process.env.OPENCODE_CONFIG_DIR = previousOpenCodeConfigDir;
});

describe("@pumblus/okf-harness package", () => {
  it("publishes only the native integration surfaces", async () => {
    const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

    expect(packageJson.name).toBe("@pumblus/okf-harness");
    expect(packageJson.main).toBe("./dist/opencode.js");
    expect(packageJson.exports["."]).toEqual({
      types: "./dist/opencode.d.ts",
      import: "./dist/opencode.js",
    });
    expect(packageJson.files).toEqual(["dist", "skills", "README.md"]);
    expect(packageJson.pi).toEqual({ skills: ["./skills"] });
    expect(packageJson.keywords).toContain("openclaw");
    expect(packageJson.keywords).toContain("clawhub");
    expect(packageJson.bin).toBeUndefined();
    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.scripts.postinstall).toBeUndefined();
  });

  it("bundles only the unified host skill", async () => {
    const skill = await readFile(
      path.join(packageRoot, "skills", "okf-harness", "SKILL.md"),
      "utf8",
    );
    const { version } = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

    expect(skill).toContain("name: okf-harness");
    expect(skill).toContain("compatibility: pi, opencode, openclaw");
    expect(skill).toContain("openclaw:");
    expect(skill).toContain('okf-harness-managed: "true"');
    expect(skill).toContain('okf-harness-entrypoint: "host"');
    expect(skill).toContain("npx @okf-harness/setup@latest launch");
    expect(skill).toContain(`@okf-harness/cli@${version} okfh init`);
    expect(skill).not.toContain("@okf-harness/cli@latest okfh init");
    expect(skill).toContain("WORKSPACE_NOT_FOUND");
    expect(skill).toContain("RUNTIME_PIN_MISSING");
    expect(skill).toContain("check --json");
    expect(skill).toContain("source add <source> --json");
    expect(skill).toContain('evidence "<question>" --json');
    expect(skill).toContain("graph --json");
    expect(skill).toContain("does not install workspace-local guidance");
    expect(skill).not.toContain("name: okf-harness-bootstrap");
    expect(skill).not.toContain("command -v okfh");
    expect(skill).not.toContain("npm install -g @okf-harness/cli");
  });

  it("publishes the unified Hermes custom tap skill", async () => {
    const skill = await readFile(path.join(repoRoot, "skills", "okf-harness", "SKILL.md"), "utf8");

    expect(skill).toContain("name: okf-harness");
    expect(skill).toContain("hermes:");
    expect(skill).toContain('okf-harness-entrypoint: "host"');
    expect(skill).toContain('okf-harness-install-id: "pumblus/okf-harness/okf-harness"');
    expect(skill).toContain("npx @okf-harness/setup@latest launch");
    expect(skill).not.toContain("@okf-harness/cli@latest okfh init");
    expect(skill).toContain("WORKSPACE_NOT_FOUND");
    expect(skill).toContain("check --json");
    expect(skill).toContain("does not install workspace-local guidance");
    const packagedSkill = await readFile(
      path.join(packageRoot, "skills", "okf-harness", "SKILL.md"),
      "utf8",
    );
    expect(skillBody(skill)).toBe(skillBody(packagedSkill));
    expect(skill).not.toContain("name: okf-harness-bootstrap");
    expect(skill).not.toContain("npm install -g @okf-harness/cli");
  });

  it("syncs the unified OpenCode host skill and removes the managed legacy entrypoint", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "okfh-opencode-plugin-"));
    process.env.OPENCODE_CONFIG_DIR = path.join(tempRoot, "opencode");
    const legacySkill = path.join(
      process.env.OPENCODE_CONFIG_DIR,
      "skills",
      "okf-harness-bootstrap",
      "SKILL.md",
    );
    await mkdir(path.dirname(legacySkill), { recursive: true });
    await writeFile(
      legacySkill,
      '---\nname: okf-harness-bootstrap\nmetadata:\n  okf-harness-managed: "true"\n---\n',
      "utf8",
    );

    try {
      const result = await plugin();

      expect(result).toEqual({});
      const installedSkill = await readFile(
        path.join(process.env.OPENCODE_CONFIG_DIR, "skills", "okf-harness", "SKILL.md"),
        "utf8",
      );
      expect(installedSkill).toContain("name: okf-harness");
      expect(installedSkill).toContain("npx @okf-harness/setup@latest launch");
      await expect(stat(legacySkill)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("preserves a user-owned legacy skill even when its body mentions the managed marker", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "okfh-opencode-plugin-"));
    process.env.OPENCODE_CONFIG_DIR = path.join(tempRoot, "opencode");
    const legacySkill = path.join(
      process.env.OPENCODE_CONFIG_DIR,
      "skills",
      "okf-harness-bootstrap",
      "SKILL.md",
    );
    await mkdir(path.dirname(legacySkill), { recursive: true });
    await writeFile(
      legacySkill,
      '---\nname: custom\n---\n\nExample: okf-harness-managed: "true"\n',
      "utf8",
    );

    try {
      await plugin();
      await expect(readFile(legacySkill, "utf8")).resolves.toContain("name: custom");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("does not overwrite a user-owned OpenCode skill", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "okfh-opencode-plugin-"));
    process.env.OPENCODE_CONFIG_DIR = path.join(tempRoot, "opencode");
    const target = path.join(process.env.OPENCODE_CONFIG_DIR, "skills", "okf-harness", "SKILL.md");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "---\nname: okf-harness\n---\n\ncustom\n", "utf8");

    try {
      await plugin();

      await expect(readFile(target, "utf8")).resolves.toContain("custom");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});

function skillBody(skill: string): string {
  return skill.slice(skill.indexOf("\n---\n") + 5);
}
