import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { onTestFinished } from "vitest";
import { runCli } from "../src/index.js";

export async function makeTempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(prefix);
  onTestFinished(() => rm(root, { force: true, recursive: true }));
  return root;
}

/** Turns an initialized workspace back into one created before runtime pins existed. */
export async function removeRuntimePin(workspace: string): Promise<void> {
  const configPath = path.join(workspace, "okfh.config.yaml");
  const config = await readFile(configPath, "utf8");
  const withoutPin = config.replace(/runtime:\n {2}version: .*\n/, "");
  if (withoutPin === config) {
    throw new Error("workspace config carries no runtime pin to remove");
  }
  await writeFile(configPath, withoutPin, "utf8");
}

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

export const llmWikiV1 = `# LLM Wiki

Source: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

The LLM incrementally builds and maintains a persistent wiki between the user and raw sources.
`;
export const llmWikiV2 = `${llmWikiV1}
The wiki is a persistent, compounding artifact that is kept current instead of re-derived on every query.
`;
const okfSpec = `# Open Knowledge Format

Source: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

OKF is an open, human- and agent-friendly format for representing knowledge.
It is intentionally minimal: a directory of markdown files with YAML frontmatter.
`;

export function compoundingKnowledgeTopic(overview: string): string {
  return `---
type: Topic
title: Compounding Knowledge
description: Persistent synthesis maintained by an agent.
---

# Overview

${overview}

# Citations

- [LLM Wiki Source](/references/llm-wiki-source.md)
`;
}

/** Substrate vocabulary that must never reach an Agent-facing surface. */
export const NO_SUBSTRATE_WORDS = /git|commit|hash|branch/i;

type RegisteredSource = { id: string; path: string; [field: string]: unknown };

/**
 * Seeds the disposable two-source public evolution scenario: an initialized
 * workspace carrying the LLM Wiki and OKF specification sources plus the wiki
 * pages promoted from them.
 */
export async function seedPublicEvolutionWorkspace(root: string): Promise<{
  workspace: string;
  llmWikiInput: string;
  llmWiki: RegisteredSource;
  okf: RegisteredSource;
}> {
  const workspace = path.join(root, "workspace");
  const inputs = path.join(root, "public-sources");
  const llmWikiInput = path.join(inputs, "llm-wiki.md");
  const okfInput = path.join(inputs, "okf-spec.md");

  const init = await runJsonCli([
    "node",
    "okfh",
    "init",
    workspace,
    "--name",
    "Public Knowledge",
    "--agents",
    "none",
    "--json",
  ]);
  if (init.exitCode !== 0) {
    throw new Error(`init failed: ${init.stderr}`);
  }
  await mkdir(inputs, { recursive: true });
  await writeFile(llmWikiInput, llmWikiV1, "utf8");
  await writeFile(okfInput, okfSpec, "utf8");

  const llmWiki = await addSource(workspace, llmWikiInput);
  const okf = await addSource(workspace, okfInput);

  await writeFile(
    path.join(workspace, "wiki/references/llm-wiki-source.md"),
    `---
type: Reference
title: LLM Wiki Source
description: Public source for the agent-maintained wiki pattern.
resource: ${llmWiki.path}
okfh:
  source_id: ${llmWiki.id}
---

# Summary

The source describes an LLM-maintained wiki between users and raw source material.
`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "wiki/topics/compounding-knowledge.md"),
    compoundingKnowledgeTopic(
      "Compounding Knowledge is built once in a persistent wiki and maintained as sources evolve.",
    ),
    "utf8",
  );
  await writeFile(
    path.join(workspace, "wiki/references/okf-source.md"),
    `---
type: Reference
title: OKF Specification Source
description: Public source for the Open Knowledge Format.
resource: ${okf.path}
okfh:
  source_id: ${okf.id}
---

# Summary

The source specifies a portable markdown knowledge format.
`,
    "utf8",
  );
  await writeFile(
    path.join(workspace, "wiki/topics/portable-knowledge.md"),
    `---
type: Topic
title: Portable Knowledge
description: Knowledge represented in portable files.
---

# Overview

Portable Knowledge uses markdown files with YAML frontmatter.

# Citations

- [OKF Specification Source](/references/okf-source.md)
`,
    "utf8",
  );

  return { workspace, llmWikiInput, llmWiki, okf };
}

export async function addSource(workspace: string, input: string): Promise<RegisteredSource> {
  const added = await runJsonCli([
    "node",
    "okfh",
    "source",
    "add",
    input,
    "--workspace",
    workspace,
    "--json",
  ]);
  if (added.exitCode !== 0) {
    throw new Error(`source add failed: ${added.stderr}`);
  }
  return added.result.data.source as RegisteredSource;
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
