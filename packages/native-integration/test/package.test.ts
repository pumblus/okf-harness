import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("bundles only the global bootstrap skill", async () => {
    const skill = await readFile(
      path.join(packageRoot, "skills", "okf-harness-bootstrap", "SKILL.md"),
      "utf8",
    );

    expect(skill).toContain("name: okf-harness-bootstrap");
    expect(skill).toContain("compatibility: pi, opencode, openclaw");
    expect(skill).toContain("openclaw:");
    expect(skill).toContain('okf-harness-managed: "true"');
    expect(skill).toContain('okf-harness-entrypoint: "bootstrap"');
    expect(skill).toContain("npx @okf-harness/setup@latest");
    expect(skill).toContain("Do not install, update, or replace the runtime");
    expect(skill).not.toContain("name: okf-harness\n");
    expect(skill).not.toContain("npm install -g @okf-harness/cli");
  });

  it("publishes the Hermes custom tap skill shape", async () => {
    const skill = await readFile(path.join(repoRoot, "skills", "okf-harness", "SKILL.md"), "utf8");

    expect(skill).toContain("name: okf-harness-bootstrap");
    expect(skill).toContain("hermes:");
    expect(skill).toContain('okf-harness-entrypoint: "bootstrap"');
    expect(skill).toContain('okf-harness-install-id: "pumblus/okf-harness/okf-harness"');
    expect(skill).toContain("npx @okf-harness/setup@latest");
    expect(skill).toContain("exposes only `okf-harness-bootstrap`");
    expect(skill).not.toContain("name: okf-harness\n");
    expect(skill).not.toContain("npm install -g @okf-harness/cli");
  });

  it("syncs the OpenCode global bootstrap skill without touching the runtime", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "okfh-opencode-plugin-"));
    process.env.OPENCODE_CONFIG_DIR = path.join(tempRoot, "opencode");

    try {
      const result = await plugin();

      expect(result).toEqual({});
      const installedSkill = await readFile(
        path.join(process.env.OPENCODE_CONFIG_DIR, "skills", "okf-harness-bootstrap", "SKILL.md"),
        "utf8",
      );
      expect(installedSkill).toContain("name: okf-harness-bootstrap");
      expect(installedSkill).toContain("npx @okf-harness/setup@latest");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("does not overwrite a user-owned OpenCode skill", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "okfh-opencode-plugin-"));
    process.env.OPENCODE_CONFIG_DIR = path.join(tempRoot, "opencode");
    const target = path.join(
      process.env.OPENCODE_CONFIG_DIR,
      "skills",
      "okf-harness-bootstrap",
      "SKILL.md",
    );
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "---\nname: okf-harness-bootstrap\n---\n\ncustom\n", "utf8");

    try {
      await plugin();

      await expect(readFile(target, "utf8")).resolves.toContain("custom");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
