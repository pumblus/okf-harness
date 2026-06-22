import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli bootstrap", () => {
  it("installs, reports, and uninstalls the Codex global bootstrap skill", async () => {
    await withFakeCodexHome(async (codexHome) => {
      const skillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");

      const install = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "codex",
        "--json",
      ]);

      expect(install).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "bootstrap install",
          workspace: null,
          data: {
            agent: "codex",
            dryRun: false,
            status: { state: "installed" },
            conflicts: [],
            writtenFiles: expect.arrayContaining([skillPath]),
          },
        },
      });
      await expect(readFile(skillPath, "utf8")).resolves.toContain(
        'okf-harness-entrypoint: "bootstrap"',
      );

      const status = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);

      expect(status).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          command: "bootstrap status",
          data: { status: { state: "installed", skillPath } },
        },
      });

      const uninstall = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "uninstall",
        "--agents",
        "codex",
        "--json",
      ]);

      expect(uninstall).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          command: "bootstrap uninstall",
          data: {
            status: { state: "missing" },
            removedFiles: expect.arrayContaining([skillPath]),
          },
        },
      });
      await expect(stat(skillPath)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("supports dry-run install and uninstall without changing files", async () => {
    await withFakeCodexHome(async (codexHome) => {
      const skillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");

      const missing = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(missing).toMatchObject({
        exitCode: 1,
        result: { ok: false, data: { status: { state: "missing" } } },
      });

      const dryInstall = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "codex",
        "--dry-run",
        "--json",
      ]);
      expect(dryInstall).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            dryRun: true,
            status: { state: "missing" },
            plannedWrites: expect.arrayContaining([skillPath]),
          },
        },
      });
      await expect(stat(skillPath)).rejects.toMatchObject({ code: "ENOENT" });

      await runJsonCli(["node", "okfh", "bootstrap", "install", "--agents", "codex", "--json"]);
      const dryUninstall = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "uninstall",
        "--agents",
        "codex",
        "--dry-run",
        "--json",
      ]);
      expect(dryUninstall).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            dryRun: true,
            status: { state: "installed" },
            plannedRemovals: expect.arrayContaining([skillPath]),
          },
        },
      });
      await expect(stat(skillPath)).resolves.toBeDefined();
    });
  });

  it("reports unmanaged same-name conflicts without overwriting or removing them", async () => {
    await withFakeCodexHome(async (codexHome) => {
      const skillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");
      await mkdir(path.dirname(skillPath), { recursive: true });
      await writeFile(skillPath, "---\nname: okf-harness-bootstrap\n---\n\n# Mine\n", "utf8");

      const install = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(install).toMatchObject({
        exitCode: 1,
        result: {
          ok: false,
          data: {
            conflicts: [expect.objectContaining({ path: skillPath })],
            status: { state: "unmanaged-conflict" },
          },
        },
      });

      const status = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(status).toMatchObject({
        exitCode: 1,
        result: { data: { status: { state: "unmanaged-conflict", skillPath } } },
      });

      const uninstall = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "uninstall",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(uninstall).toMatchObject({
        exitCode: 1,
        result: { data: { conflicts: [expect.objectContaining({ path: skillPath })] } },
      });
      await expect(readFile(skillPath, "utf8")).resolves.toContain("# Mine");
    });
  });

  it("reports same-name filesystem conflicts without overwriting them", async () => {
    await withFakeCodexHome(async (codexHome) => {
      const skillDirectory = path.join(codexHome, "skills/okf-harness-bootstrap");
      await mkdir(path.dirname(skillDirectory), { recursive: true });
      await writeFile(skillDirectory, "mine\n", "utf8");

      const status = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(status).toMatchObject({
        exitCode: 1,
        result: {
          ok: false,
          data: {
            status: {
              state: "unmanaged-conflict",
              conflictPath: skillDirectory,
            },
          },
        },
      });

      const install = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(install).toMatchObject({
        exitCode: 1,
        result: { data: { conflicts: [expect.objectContaining({ path: skillDirectory })] } },
      });
      await expect(readFile(skillDirectory, "utf8")).resolves.toBe("mine\n");
    });

    await withFakeCodexHome(async (codexHome) => {
      const skillsDirectory = path.join(codexHome, "skills");
      await mkdir(codexHome, { recursive: true });
      await writeFile(skillsDirectory, "mine\n", "utf8");

      const status = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(status).toMatchObject({
        exitCode: 1,
        result: {
          ok: false,
          data: {
            status: {
              state: "unmanaged-conflict",
              conflictPath: skillsDirectory,
            },
          },
        },
      });
    });
  });

  it("reports managed generated-file drift and repairs it", async () => {
    await withFakeCodexHome(async (codexHome) => {
      const referencePath = path.join(
        codexHome,
        "skills/okf-harness-bootstrap/references/setup.md",
      );
      await runJsonCli(["node", "okfh", "bootstrap", "install", "--agents", "codex", "--json"]);
      await rm(referencePath);

      const status = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(status).toMatchObject({
        exitCode: 1,
        result: {
          ok: false,
          data: {
            status: {
              state: "version-drifted",
              versionDrift: "unknown",
            },
          },
        },
      });

      const repair = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(repair).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            status: { state: "installed" },
            writtenFiles: expect.arrayContaining([referencePath]),
          },
        },
      });
    });
  });

  it("reports missing or wrong managed agent metadata", async () => {
    await withFakeCodexHome(async (codexHome) => {
      const skillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");
      const install = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(install.exitCode).toBe(0);
      const installed = await readFile(skillPath, "utf8");

      await writeFile(skillPath, installed.replace('  okf-harness-agent: "codex"\n', ""), "utf8");
      const missing = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(missing).toMatchObject({
        exitCode: 1,
        result: {
          data: {
            status: {
              state: "version-drifted",
              versionDrift: "unknown",
            },
          },
        },
      });

      await writeFile(
        skillPath,
        installed.replace('  okf-harness-agent: "codex"', '  okf-harness-agent: "claude"'),
        "utf8",
      );
      const wrong = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(wrong).toMatchObject({
        exitCode: 1,
        result: {
          data: {
            status: {
              state: "unmanaged-conflict",
            },
          },
        },
      });
    });
  });

  it("repairs the bootstrap skill through the repair action", async () => {
    await withFakeCodexHome(async (codexHome) => {
      const skillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");
      await writeManagedBootstrap(skillPath, "0.0.1");

      const repair = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "repair",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(repair).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          command: "bootstrap repair",
          data: {
            status: { state: "installed" },
            replacedFiles: expect.arrayContaining([skillPath]),
          },
        },
      });
    });
  });

  it("reports older and newer managed version drift with a repair command", async () => {
    await withFakeCodexHome(async (codexHome) => {
      const skillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");
      await writeManagedBootstrap(skillPath, "0.0.1");

      const older = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(older).toMatchObject({
        exitCode: 1,
        result: {
          ok: false,
          data: { status: { state: "version-drifted", versionDrift: "older" } },
          next: [expect.stringContaining("okfh bootstrap repair --agents codex --json")],
        },
      });

      await writeManagedBootstrap(skillPath, "999.0.0");
      const newer = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(newer).toMatchObject({
        exitCode: 1,
        result: {
          data: { status: { state: "version-drifted", versionDrift: "newer" } },
        },
      });

      const repair = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "codex",
        "--json",
      ]);
      expect(repair).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            status: { state: "installed" },
            replacedFiles: expect.arrayContaining([skillPath]),
          },
        },
      });
    });
  });
});

async function withFakeCodexHome(run: (codexHome: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "okfh-bootstrap-"));
  const codexHome = path.join(root, ".codex");
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  try {
    await run(codexHome);
  } finally {
    if (previous === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = previous;
    }
  }
}

async function writeManagedBootstrap(skillPath: string, version: string): Promise<void> {
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(
    skillPath,
    `---
name: okf-harness-bootstrap
metadata:
  okf-harness-version: "${version}"
  okf-harness-managed: "true"
  okf-harness-entrypoint: "bootstrap"
  okf-harness-agent: "codex"
---

# Old Bootstrap
`,
    "utf8",
  );
}
