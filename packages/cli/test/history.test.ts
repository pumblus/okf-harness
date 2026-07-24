import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runJsonCli } from "./helpers.js";

describe("@okf-harness/cli history", () => {
  it("initializes recovery by default and returns no completions for a new workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-history-"));
    const workspace = path.join(root, "workspace");

    try {
      const init = await runJsonCli([
        "node",
        "okfh",
        "init",
        workspace,
        "--name",
        "Research",
        "--agents",
        "none",
        "--json",
      ]);

      expect(init.exitCode).toBe(0);
      expect(init.stderr).toBe("");
      expect(init.result.data).not.toHaveProperty("git");
      expect(JSON.stringify(init.result)).not.toMatch(/git|commit|hash|branch/i);

      const history = await runJsonCli([
        "node",
        "okfh",
        "history",
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(history).toMatchObject({
        exitCode: 0,
        stderr: "",
        result: {
          ok: true,
          command: "history",
          workspace,
          data: { completions: [] },
          warnings: [],
          next: [],
        },
      });
      expect(JSON.stringify(history.result)).not.toMatch(/git|commit|hash|branch/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a path that is not an OKF Harness workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-history-"));
    const workspace = path.join(root, "not-a-workspace");
    await mkdir(workspace);

    try {
      const history = await runJsonCli([
        "node",
        "okfh",
        "history",
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(history.exitCode).toBe(1);
      expect(history.stdout).toBe("");
      expect(JSON.parse(history.stderr)).toMatchObject({
        ok: false,
        command: "history",
        workspace,
        error: { code: "CONFIG_INVALID" },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
