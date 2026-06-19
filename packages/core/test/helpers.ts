import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const validWorkspaceFixture = path.resolve("packages/core/test/fixtures/valid-workspace");

export async function copyValidWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "okfh-core-"));
  await cp(validWorkspaceFixture, workspaceRoot, { recursive: true });
  await mkdir(path.join(workspaceRoot, ".git"));
  return workspaceRoot;
}
