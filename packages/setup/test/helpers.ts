import { mkdtemp, rm } from "node:fs/promises";
import { onTestFinished } from "vitest";

export async function makeTempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(prefix);
  onTestFinished(() => rm(root, { force: true, recursive: true }));
  return root;
}
