import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceConfig } from "../config/index.js";
import { safeResolveWorkspacePath, toPosixPath, toPosixRelativePath } from "../paths/index.js";
import { type MarkdownFrontmatter, parseMarkdownFrontmatter } from "./frontmatter.js";

export const RESERVED_OKF_FILENAMES = new Set(["index.md", "log.md"]);

export type OkfMarkdownFile = {
  absolutePath: string;
  workspacePath: string;
  bundlePath: string;
  conceptId: string;
  isReserved: boolean;
  markdown: string;
  frontmatter: MarkdownFrontmatter;
};

export type OkfConcept = {
  id: string;
  absolutePath: string;
  workspacePath: string;
  bundlePath: string;
  type: string;
  title?: string;
  description?: string;
  tags: string[];
  timestamp?: string;
  frontmatter: Record<string, unknown>;
  body: string;
};

export type ConceptScanResult = {
  workspaceRoot: string;
  wikiRoot: string;
  files: OkfMarkdownFile[];
  concepts: OkfConcept[];
};

export async function scanConcepts(
  workspaceRoot: string,
  config: WorkspaceConfig,
): Promise<ConceptScanResult> {
  const wikiRoot = await safeResolveWorkspacePath(workspaceRoot, config.okf.bundle_root);
  const files = await scanMarkdownFiles(wikiRoot.absolutePath);
  const markdownFiles = await Promise.all(
    files.map(async (absolutePath) => {
      const bundlePath = toPosixRelativePath(wikiRoot.absolutePath, absolutePath);
      const markdown = await readFile(absolutePath, "utf8");
      return {
        absolutePath,
        workspacePath: toPosixRelativePath(wikiRoot.workspaceRoot, absolutePath),
        bundlePath,
        conceptId: conceptIdFromPath(bundlePath),
        isReserved: isReservedOkfFile(bundlePath),
        markdown,
        frontmatter: parseMarkdownFrontmatter(markdown),
      } satisfies OkfMarkdownFile;
    }),
  );

  const concepts = markdownFiles.flatMap((file) => {
    if (file.isReserved || !file.frontmatter.ok) {
      return [];
    }

    const conceptType = stringValue(file.frontmatter.data.type);
    if (conceptType === undefined) {
      return [];
    }

    const concept: OkfConcept = {
      id: file.conceptId,
      absolutePath: file.absolutePath,
      workspacePath: file.workspacePath,
      bundlePath: file.bundlePath,
      type: conceptType,
      tags: stringArrayValue(file.frontmatter.data.tags),
      frontmatter: file.frontmatter.data,
      body: file.frontmatter.body,
    };

    const title = stringValue(file.frontmatter.data.title);
    if (title !== undefined) {
      concept.title = title;
    }

    const description = stringValue(file.frontmatter.data.description);
    if (description !== undefined) {
      concept.description = description;
    }

    const timestamp = stringValue(file.frontmatter.data.timestamp);
    if (timestamp !== undefined) {
      concept.timestamp = timestamp;
    }

    return [concept];
  });

  return {
    workspaceRoot: wikiRoot.workspaceRoot,
    wikiRoot: wikiRoot.absolutePath,
    files: markdownFiles.sort((left, right) => left.bundlePath.localeCompare(right.bundlePath)),
    concepts: concepts.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function conceptIdFromPath(markdownPath: string): string {
  const normalized = toPosixPath(markdownPath);
  if (!normalized.endsWith(".md")) {
    throw new Error(`Concept path must end with .md: ${markdownPath}`);
  }

  const withoutWikiPrefix = normalized.startsWith("wiki/")
    ? normalized.slice("wiki/".length)
    : normalized;
  return withoutWikiPrefix.slice(0, -".md".length);
}

export function isReservedOkfFile(bundlePath: string): boolean {
  return RESERVED_OKF_FILENAMES.has(path.posix.basename(toPosixPath(bundlePath)));
}

async function scanMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return scanMarkdownFiles(absolutePath);
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        return [absolutePath];
      }

      return [];
    }),
  );

  return nested.flat().sort((left, right) => left.localeCompare(right));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
