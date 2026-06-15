import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeResolveWorkspacePath } from "../src/paths/index.js";

describe("workspace path safety", () => {
  it("resolves safe workspace-relative paths", async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, "wiki"), { recursive: true });
    await writeFile(path.join(root, "wiki", "index.md"), "# Index\n");

    const resolved = await safeResolveWorkspacePath(root, "wiki/index.md");

    expect(resolved.relativePath).toBe("wiki/index.md");
    await expect(realpath(path.join(root, "wiki", "index.md"))).resolves.toBe(
      resolved.absolutePath,
    );
  });

  it("rejects traversal outside the workspace", async () => {
    const root = await makeTempDir();

    await expect(safeResolveWorkspacePath(root, "../outside.md")).rejects.toMatchObject({
      code: "PATH_OUTSIDE_WORKSPACE",
    });
  });

  it("rejects symlinks that escape the workspace", async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    await symlink(outside, path.join(root, "outside-link"));

    await expect(safeResolveWorkspacePath(root, "outside-link/file.md")).rejects.toMatchObject({
      code: "PATH_OUTSIDE_WORKSPACE",
    });
  });
});

async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "okfh-paths-"));
}
