import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runPostinstall } from "../src/postinstall.js";

describe("@okf-harness/cli postinstall", () => {
  it("installs bootstrap skills for detected agents during interactive install", async () => {
    const { env, paths } = await fakePostinstallEnv();
    await mkdir(paths.codexStateDirectory, { recursive: true });
    await mkdir(paths.claudeHome, { recursive: true });
    let stdout = "";

    await runPostinstall({
      env,
      interactive: true,
      io: {
        writeOut: (chunk) => {
          stdout += chunk;
        },
      },
    });

    expect(stdout).toBe(
      "OKF Harness bootstrap ready: $okf-harness-bootstrap, /okf-harness-bootstrap.\n",
    );
    await expect(
      stat(path.join(paths.codexHome, "skills/okf-harness-bootstrap/SKILL.md")),
    ).resolves.toBeDefined();
    await expect(
      stat(path.join(paths.claudeHome, "skills/okf-harness-bootstrap/SKILL.md")),
    ).resolves.toBeDefined();
  });

  it("skips bootstrap writes for CI or non-interactive installs", async () => {
    for (const options of [
      { env: { CI: "true" }, interactive: true },
      {
        env: {
          CI: "true",
          npm_lifecycle_event: "postinstall",
          npm_package_name: "@okf-harness/cli",
        },
        interactive: false,
      },
      {
        env: {
          SUDO_UID: "501",
          npm_lifecycle_event: "postinstall",
          npm_package_name: "@okf-harness/cli",
        },
        interactive: false,
      },
      { env: {}, interactive: false },
    ]) {
      const { env, paths } = await fakePostinstallEnv(options.env);
      await mkdir(paths.codexStateDirectory, { recursive: true });
      let stdout = "";

      await runPostinstall({
        env,
        interactive: options.interactive,
        io: {
          writeOut: (chunk) => {
            stdout += chunk;
          },
        },
      });

      expect(stdout).toBe("OKF Harness bootstrap skipped. Run okfh doctor --json.\n");
      await expect(
        stat(path.join(paths.codexHome, "skills/okf-harness-bootstrap/SKILL.md")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("runs during npm postinstall even when npm hides script stdout", async () => {
    const { env, paths } = await fakePostinstallEnv({
      npm_lifecycle_event: "postinstall",
      npm_package_name: "@okf-harness/cli",
    });
    await mkdir(paths.codexStateDirectory, { recursive: true });
    let stdout = "";

    await runPostinstall({
      env,
      interactive: false,
      io: {
        writeOut: (chunk) => {
          stdout += chunk;
        },
      },
    });

    expect(stdout).toBe("OKF Harness bootstrap ready: $okf-harness-bootstrap.\n");
    await expect(
      stat(path.join(paths.codexHome, "skills/okf-harness-bootstrap/SKILL.md")),
    ).resolves.toBeDefined();
  });
});

async function fakePostinstallEnv(extra: NodeJS.ProcessEnv = {}): Promise<{
  env: NodeJS.ProcessEnv;
  paths: {
    claudeHome: string;
    codexHome: string;
    codexStateDirectory: string;
  };
}> {
  const root = await mkdtemp(path.join(tmpdir(), "okfh-postinstall-"));
  const home = path.join(root, "home");
  const codexHome = path.join(home, ".agents");
  const codexStateDirectory = path.join(root, ".codex");
  const claudeHome = path.join(root, ".claude");
  return {
    env: {
      CLAUDE_CONFIG_DIR: claudeHome,
      CODEX_HOME: codexStateDirectory,
      HOME: home,
      PATH: "",
      ...extra,
    },
    paths: { claudeHome, codexHome, codexStateDirectory },
  };
}
