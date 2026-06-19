import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG_INVALID, readWorkspaceConfig, type WorkspaceConfig } from "../config/index.js";
import { type OkfMarkdownFile, scanConcepts } from "../okf/concepts.js";
import { parseMarkdownLinks, resolveOkfLinkTarget } from "../okf/links.js";
import { readSourceManifest, type SourceManifestEntry } from "../source/index.js";

export type LintSeverity = "error" | "warning" | "info";

export type LintIssue = {
  code: string;
  severity: LintSeverity;
  message: string;
  path?: string;
  line?: number;
  fixable?: boolean;
};

export type LintResult = {
  ok: boolean;
  issues: LintIssue[];
};

export const OKF_MISSING_FRONTMATTER = "OKF_MISSING_FRONTMATTER" as const;
export const OKF_INVALID_FRONTMATTER = "OKF_INVALID_FRONTMATTER" as const;
export const OKF_MISSING_TYPE = "OKF_MISSING_TYPE" as const;
export const RESERVED_FILE_HAS_CONCEPT_FRONTMATTER =
  "RESERVED_FILE_HAS_CONCEPT_FRONTMATTER" as const;
export const LOG_INVALID_DATE_HEADING = "LOG_INVALID_DATE_HEADING" as const;
export const SOURCE_HASH_DRIFT = "SOURCE_HASH_DRIFT" as const;
export const SOURCE_MISSING = "SOURCE_MISSING" as const;
export const REFERENCE_SOURCE_MISSING = "REFERENCE_SOURCE_MISSING" as const;
export const BROKEN_LINK = "BROKEN_LINK" as const;
export const MISSING_INDEX_ENTRY = "MISSING_INDEX_ENTRY" as const;
export const MISSING_CITATIONS_SECTION = "MISSING_CITATIONS_SECTION" as const;
export const GIT_CHECKPOINT_POLICY_NOT_ENFORCED = "GIT_CHECKPOINT_POLICY_NOT_ENFORCED" as const;

export async function lintWorkspace(workspaceRoot: string): Promise<LintResult> {
  const configResult = await readWorkspaceConfig(workspaceRoot);
  if (!configResult.ok) {
    return {
      ok: false,
      issues: configResult.issues.map((issue) => ({
        code: CONFIG_INVALID,
        severity: "error",
        message: issue.message,
        path: issue.path,
      })),
    };
  }

  try {
    const scanResult = await scanConcepts(workspaceRoot, configResult.config);
    const sourceManifest = await readSourceManifest(workspaceRoot, configResult.config);
    const sourceIssues =
      sourceManifest.issues.length === 0
        ? [
            ...(await lintRegisteredSources(workspaceRoot, sourceManifest.entries)),
            ...lintReferenceSourceIds(scanResult.files, sourceManifest.entries),
            ...(await lintUnregisteredRawSources(
              workspaceRoot,
              configResult.config.paths.raw_sources,
              sourceManifest.entries,
            )),
          ]
        : [];
    const issues = [
      ...scanResult.files.flatMap((file) => lintMarkdownFile(file)),
      ...lintWikiWarnings(scanResult.files),
      ...(await lintSafetyWarnings(workspaceRoot, configResult.config)),
      ...sourceManifest.issues.map(
        (issue) =>
          ({
            code: issue.code,
            severity: "error",
            path: issue.path,
            line: issue.line,
            message: issue.message,
          }) satisfies LintIssue,
      ),
      ...sourceIssues,
    ];
    return {
      ok: issues.every((issue) => issue.severity !== "error"),
      issues,
    };
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: CONFIG_INVALID,
          severity: "error",
          path: configResult.config.okf.bundle_root,
          message: error instanceof Error ? error.message : "Could not scan OKF wiki.",
        },
      ],
    };
  }
}

async function lintSafetyWarnings(
  workspaceRoot: string,
  config: WorkspaceConfig,
): Promise<LintIssue[]> {
  if (
    !config.safety.require_git_checkpoint_before_agent_write ||
    (await isInsideGitWorkTree(workspaceRoot))
  ) {
    return [];
  }

  return [
    {
      code: GIT_CHECKPOINT_POLICY_NOT_ENFORCED,
      severity: "warning",
      path: "okfh.config.yaml",
      message:
        "Safety policy requires a Git checkpoint before agent writes, but this workspace is not inside a Git work tree. OKF Harness does not enforce automatic checkpoints in v0.3.1.",
    },
  ];
}

function lintReferenceSourceIds(
  files: OkfMarkdownFile[],
  entries: SourceManifestEntry[],
): LintIssue[] {
  const sourceIds = new Set(entries.map((entry) => entry.id));
  return files.flatMap((file) => {
    if (file.isReserved || !file.workspacePath.startsWith("wiki/references/")) {
      return [];
    }
    if (!file.frontmatter.ok) {
      return [];
    }

    const sourceId = frontmatterSourceId(file.frontmatter.data);
    if (sourceId === undefined || sourceIds.has(sourceId)) {
      return [];
    }

    return [
      {
        code: REFERENCE_SOURCE_MISSING,
        severity: "error",
        path: file.workspacePath,
        message: `Reference document points to an unregistered source id: ${sourceId}`,
      } satisfies LintIssue,
    ];
  });
}

async function lintUnregisteredRawSources(
  workspaceRoot: string,
  rawSourcesPath: string,
  entries: SourceManifestEntry[],
): Promise<LintIssue[]> {
  const rawRoot = path.join(workspaceRoot, rawSourcesPath);
  const registeredPaths = new Set(entries.map((entry) => entry.path));
  const files = await scanRawSourceFiles(rawRoot);

  return files.flatMap((filePath) => {
    const workspacePath = path
      .relative(workspaceRoot, filePath)
      .split(path.sep)
      .join(path.posix.sep);
    if (registeredPaths.has(workspacePath) || isIgnoredRawSourceFile(workspacePath)) {
      return [];
    }

    return [
      {
        code: "UNREGISTERED_RAW_SOURCE",
        severity: "warning",
        path: workspacePath,
        message: `Raw source file is not registered in the manifest: ${workspacePath}`,
      } satisfies LintIssue,
    ];
  });
}

async function scanRawSourceFiles(root: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return [];
    }
    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return scanRawSourceFiles(entryPath);
      }
      return entry.isFile() ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

function isIgnoredRawSourceFile(workspacePath: string): boolean {
  return workspacePath === "raw/sources/README.md" || workspacePath.endsWith("/.gitkeep");
}

function frontmatterSourceId(frontmatter: Record<string, unknown>): string | undefined {
  const okfh = frontmatter.okfh;
  if (typeof okfh !== "object" || okfh === null || Array.isArray(okfh)) {
    return undefined;
  }
  const sourceId = (okfh as { source_id?: unknown }).source_id;
  return typeof sourceId === "string" && sourceId.trim().length > 0 ? sourceId : undefined;
}

async function lintRegisteredSources(
  workspaceRoot: string,
  entries: SourceManifestEntry[],
): Promise<LintIssue[]> {
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(workspaceRoot, entry.path);
      let contents: Buffer;
      try {
        contents = await readFile(absolutePath);
      } catch (error) {
        if (errorCode(error) === "ENOENT") {
          return [
            {
              code: SOURCE_MISSING,
              severity: "error",
              path: entry.path,
              message: `Registered source is missing: ${entry.path}`,
            } satisfies LintIssue,
          ];
        }
        throw error;
      }

      const actual = createHash("sha256").update(contents).digest("hex");
      if (actual === entry.sha256) {
        return [];
      }

      return [
        {
          code: SOURCE_HASH_DRIFT,
          severity: "error",
          path: entry.path,
          message: `Registered source hash changed: ${entry.path}`,
        } satisfies LintIssue,
      ];
    }),
  );

  return nested.flat();
}

function lintMarkdownFile(file: OkfMarkdownFile): LintIssue[] {
  const issues: LintIssue[] = [];

  if (file.frontmatter.ok && file.isReserved && hasConceptFrontmatter(file.frontmatter.data)) {
    issues.push({
      code: RESERVED_FILE_HAS_CONCEPT_FRONTMATTER,
      severity: "error",
      path: file.workspacePath,
      message: `${file.bundlePath} is reserved and must not define concept frontmatter.`,
    });
  }

  if (!file.frontmatter.ok && file.frontmatter.hasFrontmatter) {
    issues.push({
      code: OKF_INVALID_FRONTMATTER,
      severity: "error",
      path: file.workspacePath,
      message: file.frontmatter.message,
    });
  }

  if (!file.isReserved) {
    if (!file.frontmatter.ok && !file.frontmatter.hasFrontmatter) {
      issues.push({
        code: OKF_MISSING_FRONTMATTER,
        severity: "error",
        path: file.workspacePath,
        message: `${file.bundlePath} is missing YAML frontmatter.`,
      });
    }

    if (file.frontmatter.ok && !hasNonEmptyType(file.frontmatter.data.type)) {
      issues.push({
        code: OKF_MISSING_TYPE,
        severity: "error",
        path: file.workspacePath,
        message: `${file.bundlePath} is missing a non-empty type field.`,
      });
    }
  }

  if (file.bundlePath.split("/").at(-1) === "log.md") {
    issues.push(...lintLogDateHeadings(file));
  }

  return issues;
}

function lintWikiWarnings(files: OkfMarkdownFile[]): LintIssue[] {
  const existingConceptIds = new Set(files.map((file) => file.conceptId));
  const indexedConceptIds = indexMentionedConceptIds(files);
  return [
    ...lintBrokenLinks(files, existingConceptIds),
    ...lintMissingIndexEntries(files, indexedConceptIds),
    ...lintMissingCitationSections(files),
  ];
}

function lintBrokenLinks(files: OkfMarkdownFile[], existingConceptIds: Set<string>): LintIssue[] {
  return files.flatMap((file) =>
    parseMarkdownLinks(file.markdown).flatMap((link) => {
      const conceptId = resolveOkfLinkTarget(link.target, file.bundlePath);
      if (conceptId === undefined || existingConceptIds.has(conceptId)) {
        return [];
      }

      return [
        {
          code: BROKEN_LINK,
          severity: "warning",
          path: file.workspacePath,
          line: link.line,
          message: `Markdown link target does not exist: ${link.target}`,
        } satisfies LintIssue,
      ];
    }),
  );
}

function lintMissingIndexEntries(
  files: OkfMarkdownFile[],
  indexedConceptIds: Set<string>,
): LintIssue[] {
  return files.flatMap((file) => {
    if (file.isReserved || indexedConceptIds.has(file.conceptId)) {
      return [];
    }

    return [
      {
        code: MISSING_INDEX_ENTRY,
        severity: "warning",
        path: file.workspacePath,
        message: `Concept is not linked from a root or directory index: ${file.workspacePath}`,
      } satisfies LintIssue,
    ];
  });
}

function lintMissingCitationSections(files: OkfMarkdownFile[]): LintIssue[] {
  return files.flatMap((file) => {
    if (file.isReserved || !file.frontmatter.ok) {
      return [];
    }
    const type = stringValue(file.frontmatter.data.type)?.toLocaleLowerCase();
    if (
      type === undefined ||
      !new Set(["topic", "entity", "project", "decision"]).has(type) ||
      hasOkfhSources(file.frontmatter.data) ||
      /^#\s+Citations\s*$/im.test(file.frontmatter.body)
    ) {
      return [];
    }

    return [
      {
        code: MISSING_CITATIONS_SECTION,
        severity: "warning",
        path: file.workspacePath,
        message: `${file.bundlePath} should include # Citations or okfh.sources.`,
      } satisfies LintIssue,
    ];
  });
}

function indexMentionedConceptIds(files: OkfMarkdownFile[]): Set<string> {
  const indexed = new Set<string>();
  for (const file of files) {
    if (path.posix.basename(file.bundlePath) !== "index.md") {
      continue;
    }
    for (const link of parseMarkdownLinks(file.markdown)) {
      const conceptId = resolveOkfLinkTarget(link.target, file.bundlePath);
      if (conceptId !== undefined) {
        indexed.add(conceptId);
      }
    }
  }
  return indexed;
}

function lintLogDateHeadings(file: OkfMarkdownFile): LintIssue[] {
  return file.markdown.split(/\r?\n/).flatMap((line, index) => {
    const heading = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    if (heading === null) {
      return [];
    }

    const headingText = heading[2];
    if (headingText === undefined) {
      return [];
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(headingText)) {
      return [];
    }

    return [
      {
        code: LOG_INVALID_DATE_HEADING,
        severity: "error",
        path: file.workspacePath,
        line: index + 1,
        message: `Log heading must be YYYY-MM-DD: ${headingText}`,
      } satisfies LintIssue,
    ];
  });
}

function hasConceptFrontmatter(frontmatter: Record<string, unknown>): boolean {
  return hasNonEmptyType(frontmatter.type);
}

function hasNonEmptyType(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function hasOkfhSources(frontmatter: Record<string, unknown>): boolean {
  const okfh = frontmatter.okfh;
  if (typeof okfh !== "object" || okfh === null || Array.isArray(okfh)) {
    return false;
  }
  const sources = (okfh as { sources?: unknown }).sources;
  return Array.isArray(sources) && sources.length > 0;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function isInsideGitWorkTree(workspaceRoot: string): Promise<boolean> {
  let current = path.resolve(workspaceRoot);
  while (true) {
    try {
      await lstat(path.join(current, ".git"));
      return true;
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        return false;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}
