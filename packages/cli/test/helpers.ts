import { readdir } from "node:fs/promises";
import path from "node:path";
import { runCli } from "../src/index.js";

export async function runJsonCli(argv: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  // biome-ignore lint/suspicious/noExplicitAny: CLI JSON integration tests need loose nested access.
  result: any;
}> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(argv, {
    writeOut: (chunk) => {
      stdout += chunk;
    },
    writeErr: (chunk) => {
      stderr += chunk;
    },
  });
  return {
    exitCode,
    stdout,
    stderr,
    result: stdout.length > 0 ? JSON.parse(stdout) : undefined,
  };
}

export async function listRawSourceFiles(workspace: string): Promise<string[]> {
  const root = path.join(workspace, "raw/sources");
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .join("raw/sources", path.relative(root, path.join(entry.parentPath, entry.name)))
        .split(path.sep)
        .join(path.posix.sep),
    )
    .sort();
}
