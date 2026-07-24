import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runJsonCli } from "./helpers.js";

const execFileAsync = promisify(execFile);

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

  it("returns completions newest first with opaque ids and stored judgments", async () => {
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

      await recordCompletion(workspace, "Removed stale pricing guidance.", "first state\n");
      await recordCompletion(
        workspace,
        "Reframed the rollout around verified evidence.",
        "second state\n",
      );

      const history = await runJsonCli([
        "node",
        "okfh",
        "history",
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(history.exitCode).toBe(0);
      expect(history.stderr).toBe("");
      expect(history.result).toMatchObject({
        ok: true,
        command: "history",
        workspace,
        data: {
          completions: [
            {
              id: expect.any(String),
              judgment: "Reframed the rollout around verified evidence.",
            },
            {
              id: expect.any(String),
              judgment: "Removed stale pricing guidance.",
            },
          ],
        },
        warnings: [],
        next: [],
      });
      const ids = history.result.data.completions.map(
        (completion: { id: string }) => completion.id,
      );
      expect(ids.every((id: string) => id.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(2);
      expect(JSON.stringify(history.result)).not.toMatch(/git|commit|hash|branch/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function recordCompletion(
  workspace: string,
  judgment: string,
  contents: string,
): Promise<void> {
  await writeFile(path.join(workspace, "wiki/topics/activity.md"), contents, "utf8");
  await execFileAsync("git", ["-C", workspace, "add", "--all"]);
  await execFileAsync("git", [
    "-C",
    workspace,
    "-c",
    "user.name=OKF Harness",
    "-c",
    "user.email=workspace@okf-harness.local",
    "-c",
    "commit.gpgSign=false",
    "commit",
    "--quiet",
    "--no-verify",
    "-m",
    "OKF Harness completion",
    "-m",
    judgment,
  ]);
}
