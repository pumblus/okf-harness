import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runJsonCli } from "./helpers.js";

const NO_SUBSTRATE_WORDS = /git|commit|hash|branch/i;

async function checkpoint(workspace: string, judgment: string) {
  const result = await runJsonCli([
    "node",
    "okfh",
    "checkpoint",
    "--judgment",
    judgment,
    "--workspace",
    workspace,
    "--json",
  ]);
  expect(result.exitCode).toBe(0);
  return result.result.data.completion as { id: string; judgment: string };
}

async function history(workspace: string) {
  const result = await runJsonCli(["node", "okfh", "history", "--workspace", workspace, "--json"]);
  expect(result.exitCode).toBe(0);
  return result.result.data.completions as Array<{ id: string; judgment: string }>;
}

describe("@okf-harness/cli restore", () => {
  it("restores the workspace to a non-latest completion and keeps the recovery trail", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-restore-"));
    const workspace = path.join(root, "workspace");
    const kept = path.join(workspace, "wiki/topics/kept.md");
    const removed = path.join(workspace, "wiki/topics/removed.md");
    const added = path.join(workspace, "wiki/topics/added.md");

    try {
      await runJsonCli([
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

      await writeFile(kept, "---\ntype: Topic\ntitle: Kept\n---\n\nFirst version.\n", "utf8");
      await writeFile(removed, "---\ntype: Topic\ntitle: Removed\n---\n\nStill here.\n", "utf8");
      const first = await checkpoint(workspace, "Wrote the first topics.");

      await writeFile(kept, "---\ntype: Topic\ntitle: Kept\n---\n\nSecond version.\n", "utf8");
      await rm(removed);
      await writeFile(added, "---\ntype: Topic\ntitle: Added\n---\n\nNew topic.\n", "utf8");
      const second = await checkpoint(workspace, "Rewrote one topic, removed one, added one.");

      const restore = await runJsonCli([
        "node",
        "okfh",
        "restore",
        first.id,
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(restore.exitCode).toBe(0);
      expect(restore.stderr).toBe("");
      expect(restore.result).toMatchObject({
        ok: true,
        command: "restore",
        workspace,
        data: { completion: first },
        warnings: [],
        next: [],
      });
      expect(JSON.stringify(restore.result)).not.toMatch(NO_SUBSTRATE_WORDS);

      // Structure and prose return to the first completion exactly.
      await expect(readFile(kept, "utf8")).resolves.toBe(
        "---\ntype: Topic\ntitle: Kept\n---\n\nFirst version.\n",
      );
      await expect(readFile(removed, "utf8")).resolves.toBe(
        "---\ntype: Topic\ntitle: Removed\n---\n\nStill here.\n",
      );
      await expect(readFile(added, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      // The trail is preserved: both completions moved through remain listed.
      expect(await history(workspace)).toEqual([second, first]);

      // The workspace lands on a consistent completed state.
      const check = await runJsonCli(["node", "okfh", "check", "--workspace", workspace, "--json"]);
      expect(check.exitCode).toBe(0);
      expect(JSON.stringify(check.result)).not.toMatch(NO_SUBSTRATE_WORDS);

      // Moving forward again reaches the later completion.
      const forward = await runJsonCli([
        "node",
        "okfh",
        "restore",
        second.id,
        "--workspace",
        workspace,
        "--json",
      ]);
      expect(forward.exitCode).toBe(0);
      await expect(readFile(kept, "utf8")).resolves.toBe(
        "---\ntype: Topic\ntitle: Kept\n---\n\nSecond version.\n",
      );
      await expect(readFile(added, "utf8")).resolves.toBe(
        "---\ntype: Topic\ntitle: Added\n---\n\nNew topic.\n",
      );
      expect(await history(workspace)).toEqual([second, first]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an unknown completion id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-restore-"));
    const workspace = path.join(root, "workspace");

    try {
      await runJsonCli([
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

      const restore = await runJsonCli([
        "node",
        "okfh",
        "restore",
        "completion_does-not-exist",
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(restore.exitCode).toBe(1);
      expect(restore.stdout).toBe("");
      expect(JSON.parse(restore.stderr)).toMatchObject({
        ok: false,
        command: "restore",
        workspace,
        error: { code: "COMPLETION_NOT_FOUND" },
      });
      expect(restore.stderr).not.toMatch(NO_SUBSTRATE_WORDS);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite changes that are not part of a completion yet", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "okfh-restore-"));
    const workspace = path.join(root, "workspace");
    const topic = path.join(workspace, "wiki/topics/kept.md");

    try {
      await runJsonCli([
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
      await writeFile(topic, "---\ntype: Topic\ntitle: Kept\n---\n\nFirst version.\n", "utf8");
      const first = await checkpoint(workspace, "Wrote the first topic.");

      await writeFile(topic, "---\ntype: Topic\ntitle: Kept\n---\n\nUnsealed edit.\n", "utf8");
      const restore = await runJsonCli([
        "node",
        "okfh",
        "restore",
        first.id,
        "--workspace",
        workspace,
        "--json",
      ]);

      expect(restore.exitCode).toBe(1);
      expect(restore.stdout).toBe("");
      expect(JSON.parse(restore.stderr)).toMatchObject({
        ok: false,
        command: "restore",
        workspace,
        error: { code: "WORKSPACE_NOT_SEALED" },
      });
      expect(restore.stderr).not.toMatch(NO_SUBSTRATE_WORDS);

      // The unsealed edit is untouched.
      await expect(readFile(topic, "utf8")).resolves.toBe(
        "---\ntype: Topic\ntitle: Kept\n---\n\nUnsealed edit.\n",
      );
      expect(await history(workspace)).toEqual([first]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
