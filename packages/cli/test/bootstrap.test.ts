import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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

  it("installs, reports, and uninstalls the Claude Code global bootstrap skill", async () => {
    await withFakeBootstrapEnv(async ({ claudeHome }) => {
      const skillPath = path.join(claudeHome, "skills/okf-harness-bootstrap/SKILL.md");

      const install = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "claude",
        "--json",
      ]);

      expect(install).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "bootstrap install",
          data: {
            agent: "claude",
            status: { state: "installed", skillPath },
            writtenFiles: expect.arrayContaining([skillPath]),
          },
        },
      });
      const skill = await readFile(skillPath, "utf8");
      expect(skill).toContain('okf-harness-agent: "claude"');
      await expect(
        readFile(path.join(claudeHome, "skills/okf-harness-bootstrap/references/setup.md"), "utf8"),
      ).resolves.toContain("/okf-harness");

      const status = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "claude",
        "--json",
      ]);
      expect(status).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agent: "claude",
            status: {
              state: "installed",
              detection: {
                agent: "claude",
                userStateDirectory: { path: claudeHome, detected: true },
              },
            },
          },
        },
      });

      const uninstall = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "uninstall",
        "--agents",
        "claude",
        "--json",
      ]);
      expect(uninstall).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agent: "claude",
            status: { state: "missing" },
            removedFiles: expect.arrayContaining([skillPath]),
          },
        },
      });
      await expect(stat(skillPath)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("installs only detected agents with --agents all", async () => {
    await withFakeBootstrapEnv(async ({ codexHome, codexStateDirectory, claudeHome }) => {
      await mkdir(codexStateDirectory, { recursive: true });
      const codexSkillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");
      const claudeSkillPath = path.join(claudeHome, "skills/okf-harness-bootstrap/SKILL.md");

      const result = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "all",
        "--json",
      ]);

      expect(result).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agents: [
              {
                agent: "codex",
                detected: true,
                detection: {
                  userStateDirectory: { path: codexStateDirectory, detected: true },
                },
                result: { status: { state: "installed" } },
              },
              {
                agent: "claude",
                detected: false,
                skipped: true,
                reason: "not-detected",
              },
            ],
          },
          warnings: [
            expect.objectContaining({
              code: "BOOTSTRAP_AGENT_NOT_DETECTED",
              message: expect.stringContaining("Claude Code"),
            }),
          ],
        },
      });
      await expect(stat(codexSkillPath)).resolves.toBeDefined();
      await expect(stat(claudeSkillPath)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("detects Claude Code from the user-state directory with --agents all", async () => {
    await withFakeBootstrapEnv(async ({ codexHome, claudeHome }) => {
      await mkdir(claudeHome, { recursive: true });
      const codexSkillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");
      const claudeSkillPath = path.join(claudeHome, "skills/okf-harness-bootstrap/SKILL.md");

      const result = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "all",
        "--json",
      ]);

      expect(result).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agents: [
              { agent: "codex", detected: false, skipped: true },
              {
                agent: "claude",
                detected: true,
                detection: {
                  executable: { command: "claude", detected: false },
                  userStateDirectory: { path: claudeHome, detected: true },
                },
                result: { status: { state: "installed" } },
              },
            ],
          },
        },
      });
      await expect(stat(codexSkillPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(claudeSkillPath, "utf8")).resolves.toContain(
        'okf-harness-agent: "claude"',
      );
    });
  });

  it("does not detect directories on PATH as agent executables", async () => {
    await withFakeBootstrapEnv(async ({ bin }) => {
      await mkdir(path.join(bin, "codex"));

      const result = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "all",
        "--json",
      ]);

      expect(result).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agents: [
              { agent: "codex", detected: false, skipped: true },
              { agent: "claude", detected: false, skipped: true },
            ],
          },
        },
      });
    });
  });

  it("reports both detected agents and neither detected through --agents all", async () => {
    await withFakeBootstrapEnv(async ({ bin, claudeHome, codexStateDirectory }) => {
      await writeFakeExecutable(bin, "codex");
      await writeFakeExecutable(bin, "claude");

      const install = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "all",
        "--json",
      ]);
      expect(install).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agents: [
              { agent: "codex", detected: true, result: { status: { state: "installed" } } },
              { agent: "claude", detected: true, result: { status: { state: "installed" } } },
            ],
          },
          warnings: [],
        },
      });
      await expect(stat(path.join(codexStateDirectory, "AGENTS.md"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(stat(path.join(claudeHome, "CLAUDE.md"))).rejects.toMatchObject({
        code: "ENOENT",
      });

      const status = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "status",
        "--agents",
        "all",
        "--json",
      ]);
      expect(status).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agents: [
              { agent: "codex", status: { state: "installed" } },
              { agent: "claude", status: { state: "installed" } },
            ],
          },
        },
      });

      const uninstall = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "uninstall",
        "--agents",
        "all",
        "--json",
      ]);
      expect(uninstall).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agents: [
              { agent: "codex", result: { status: { state: "missing" } } },
              { agent: "claude", result: { status: { state: "missing" } } },
            ],
          },
        },
      });
    });

    await withFakeBootstrapEnv(async () => {
      const result = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "all",
        "--json",
      ]);
      expect(result).toMatchObject({
        exitCode: 0,
        result: {
          ok: true,
          data: {
            agents: [
              { agent: "codex", detected: false, skipped: true },
              { agent: "claude", detected: false, skipped: true },
            ],
          },
          warnings: [
            expect.objectContaining({ message: expect.stringContaining("Codex") }),
            expect.objectContaining({ message: expect.stringContaining("Claude Code") }),
          ],
        },
      });
    });
  });

  it("continues --agents all when one detected agent has a bootstrap conflict", async () => {
    await withFakeBootstrapEnv(async ({ bin, codexHome, claudeHome }) => {
      await writeFakeExecutable(bin, "codex");
      await writeFakeExecutable(bin, "claude");
      const codexSkillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");
      const claudeSkillPath = path.join(claudeHome, "skills/okf-harness-bootstrap/SKILL.md");
      await mkdir(path.dirname(codexSkillPath), { recursive: true });
      await writeFile(codexSkillPath, "---\nname: okf-harness-bootstrap\n---\n\n# Mine\n", "utf8");

      const result = await runJsonCli([
        "node",
        "okfh",
        "bootstrap",
        "install",
        "--agents",
        "all",
        "--json",
      ]);

      expect(result).toMatchObject({
        exitCode: 1,
        result: {
          ok: false,
          data: {
            agents: [
              {
                agent: "codex",
                result: {
                  status: { state: "unmanaged-conflict" },
                  conflicts: [expect.objectContaining({ path: codexSkillPath })],
                },
              },
              {
                agent: "claude",
                result: { status: { state: "installed" } },
              },
            ],
          },
          warnings: [expect.objectContaining({ code: "BOOTSTRAP_AGENT_FAILED" })],
          next: expect.arrayContaining([
            expect.stringContaining("Review the existing okf-harness-bootstrap skill"),
          ]),
        },
      });
      await expect(readFile(codexSkillPath, "utf8")).resolves.toContain("# Mine");
      await expect(stat(claudeSkillPath)).resolves.toBeDefined();
    });
  });

  it("fails --agents all when one detected bootstrap target is unwritable", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) {
      return;
    }

    await withFakeBootstrapEnv(async ({ bin, codexHome }) => {
      await writeFakeExecutable(bin, "codex");
      await writeFakeExecutable(bin, "claude");
      const codexParent = path.dirname(codexHome);
      await mkdir(codexParent, { recursive: true });
      await chmod(codexParent, 0o555);
      try {
        const result = await runJsonCli([
          "node",
          "okfh",
          "bootstrap",
          "repair",
          "--agents",
          "all",
          "--json",
        ]);

        expect(result).toMatchObject({
          exitCode: 1,
          result: {
            ok: false,
            data: {
              agents: [
                {
                  agent: "codex",
                  result: {
                    status: { state: "unwritable-target", blockedPath: codexParent },
                  },
                },
                {
                  agent: "claude",
                  result: { status: { state: "installed" } },
                },
              ],
            },
            warnings: [expect.objectContaining({ code: "BOOTSTRAP_AGENT_FAILED" })],
            next: expect.arrayContaining([
              expect.stringContaining("Make the bootstrap target writable"),
            ]),
          },
        });
      } finally {
        await chmod(codexParent, 0o755);
      }
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

  it("reports unwritable bootstrap targets without throwing", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) {
      return;
    }

    await withFakeCodexHome(async (codexHome) => {
      const home = path.dirname(codexHome);
      await mkdir(home, { recursive: true });
      await chmod(home, 0o555);
      try {
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
          exitCode: 1,
          stderr: "",
          result: {
            ok: false,
            command: "bootstrap repair",
            data: {
              status: {
                state: "unwritable-target",
                targetDirectory: codexHome,
                blockedPath: home,
              },
            },
            next: [expect.stringContaining("Make the bootstrap target writable")],
          },
        });
      } finally {
        await chmod(home, 0o755);
      }
    });
  });

  it("reports unreadable existing bootstrap files without throwing", async () => {
    if (process.platform === "win32" || process.getuid?.() === 0) {
      return;
    }

    await withFakeCodexHome(async (codexHome) => {
      const skillPath = path.join(codexHome, "skills/okf-harness-bootstrap/SKILL.md");
      await writeManagedBootstrap(skillPath, "0.0.1");
      await chmod(skillPath, 0o200);
      try {
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
          stderr: "",
          result: {
            ok: false,
            command: "bootstrap status",
            data: {
              status: {
                state: "unwritable-target",
                blockedPath: skillPath,
              },
            },
            next: [expect.stringContaining("Make the bootstrap target writable")],
          },
        });
      } finally {
        await chmod(skillPath, 0o600);
      }
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
  const home = path.join(root, "home");
  const codexHome = path.join(home, ".agents");
  const keys = ["CODEX_HOME", "HOME", "USERPROFILE"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<
    (typeof keys)[number],
    string | undefined
  >;
  process.env.CODEX_HOME = path.join(root, ".codex");
  process.env.HOME = home;
  delete process.env.USERPROFILE;
  try {
    await run(codexHome);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withFakeBootstrapEnv(
  run: (paths: {
    bin: string;
    claudeHome: string;
    codexHome: string;
    codexStateDirectory: string;
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "okfh-bootstrap-"));
  const bin = path.join(root, "bin");
  const home = path.join(root, "home");
  const codexHome = path.join(home, ".agents");
  const codexStateDirectory = path.join(root, ".codex");
  const claudeHome = path.join(root, ".claude");
  await mkdir(bin, { recursive: true });
  const keys = ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "HOME", "PATH", "USERPROFILE"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<
    (typeof keys)[number],
    string | undefined
  >;
  process.env.CLAUDE_CONFIG_DIR = claudeHome;
  process.env.CODEX_HOME = codexStateDirectory;
  process.env.HOME = home;
  process.env.PATH = bin;
  delete process.env.USERPROFILE;
  try {
    await run({ bin, claudeHome, codexHome, codexStateDirectory });
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function writeFakeExecutable(bin: string, name: string): Promise<void> {
  const executable = path.join(bin, name);
  await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(executable, 0o755);
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
