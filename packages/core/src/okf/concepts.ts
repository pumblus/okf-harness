import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceConfig } from "../config/index.js";
import {
  safeResolveWorkspacePath,
  toPosixPath,
  toPosixRelativePath,
  type WorkspacePathResolution,
} from "../paths/index.js";
import { okfDocumentView } from "./document.js";
import { type MarkdownFrontmatter, parseMarkdownFrontmatter } from "./frontmatter.js";

export const RESERVED_OKF_FILENAMES = new Set(["index.md", "log.md"]);
export const SCAN_FAILED = "SCAN_FAILED" as const;

export class ConceptScanError extends Error {
  readonly code = SCAN_FAILED;

  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ConceptScanError";
  }
}

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
  config: { okf: Pick<WorkspaceConfig["okf"], "bundle_root"> },
): Promise<ConceptScanResult> {
  let wikiRoot: WorkspacePathResolution;
  let markdownFiles: OkfMarkdownFile[];

  try {
    wikiRoot = await safeResolveWorkspacePath(workspaceRoot, config.okf.bundle_root);
    const files = await scanMarkdownFiles(wikiRoot.absolutePath);
    markdownFiles = await Promise.all(
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
  } catch (error) {
    throw new ConceptScanError(
      error instanceof Error ? error.message : "Could not scan OKF wiki.",
      {
        wikiRoot: config.okf.bundle_root,
      },
    );
  }

  const concepts = markdownFiles.flatMap((file) => {
    if (file.isReserved || !file.frontmatter.ok) {
      return [];
    }

    const document = okfDocumentView(file);
    if (document.type === undefined) {
      return [];
    }

    const concept: OkfConcept = {
      id: file.conceptId,
      absolutePath: file.absolutePath,
      workspacePath: file.workspacePath,
      bundlePath: file.bundlePath,
      type: document.type,
      tags: document.tags,
      frontmatter: file.frontmatter.data,
      body: document.body,
    };

    const title = file.frontmatter.data.title;
    if (typeof title === "string" && title.trim().length > 0) {
      concept.title = title;
    }

    if (document.description !== undefined) {
      concept.description = document.description;
    }

    if (document.timestamp !== undefined) {
      concept.timestamp = document.timestamp;
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
