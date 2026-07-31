import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { onTestFinished } from "vitest";

export const validWorkspaceFixture = path.resolve("packages/core/test/fixtures/valid-workspace");

export async function makeTempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  onTestFinished(() => rm(root, { force: true, recursive: true }));
  return root;
}

export async function copyValidWorkspace(): Promise<string> {
  const workspaceRoot = await makeTempDir("okfh-core-");
  await cp(validWorkspaceFixture, workspaceRoot, { recursive: true });
  return workspaceRoot;
}
