import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceConfig } from "../config/index.js";
import { readWorkspaceLineage, toErrorIssue, type WorkspaceLineage } from "../lineage/index.js";
import type { OkfMarkdownFile } from "../okf/concepts.js";
import { okfDocumentView } from "../okf/document.js";
import { parseMarkdownLinks, resolveOkfLinkTarget } from "../okf/links.js";
import { MANIFEST_INVALID, type SourceManifestEntry } from "../source/index.js";
import type { ReconciliationEdge } from "../source/reconciliation.js";
import { REFERENCE_SOURCE_MISSING } from "./codes.js";

export { type ReferenceSourceLink, referenceSourceLinks } from "../lineage/index.js";
export { REFERENCE_SOURCE_MISSING };

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
export const SOURCE_LINEAGE_SUSPECTED = "SOURCE_LINEAGE_SUSPECTED" as const;
export const SOURCE_MISSING = "SOURCE_MISSING" as const;
export const BROKEN_LINK = "BROKEN_LINK" as const;
export const MISSING_INDEX_ENTRY = "MISSING_INDEX_ENTRY" as const;
export const MISSING_CITATIONS_SECTION = "MISSING_CITATIONS_SECTION" as const;
export const GIT_CHECKPOINT_POLICY_NOT_ENFORCED = "GIT_CHECKPOINT_POLICY_NOT_ENFORCED" as const;
export const WORKSPACE_READ_FAILED = "WORKSPACE_READ_FAILED" as const;

export async function lintWorkspace(workspaceRoot: string): Promise<LintResult> {
  return lintWorkspaceFromLineage(workspaceRoot, await readWorkspaceLineage(workspaceRoot));
}

export async function lintWorkspaceFromLineage(
  workspaceRoot: string,
  lineage: WorkspaceLineage,
): Promise<LintResult> {
  if (lineage.config === undefined) {
    return { ok: false, issues: lineage.issues };
  }

  const files = lineage.files;
  const manifestReadable = !lineage.issues.some((issue) => issue.code === MANIFEST_INVALID);
  const sourceIssues =
    manifestReadable && lineage.manifestIssues.length === 0
      ? [
          ...(await lintRegisteredSources(workspaceRoot, lineage.manifestEntries)),
          ...lintSourceLineage(lineage.dangling, lineage.manifestEntries),
          ...lineage.referenceIssues.filter((issue) => issue.code === REFERENCE_SOURCE_MISSING),
          ...(await lintUnregisteredRawSources(
            workspaceRoot,
            lineage.config.paths.raw_sources,
            lineage.manifestEntries,
          )),
        ]
      : [];
  const issues = [
    ...files.flatMap((file) => lintMarkdownFile(file)),
    ...lintWikiWarnings(files),
    ...(await lintSafetyWarnings(workspaceRoot, lineage.config)),
    ...lineage.issues,
    ...lineage.ledgerIssues.map(toErrorIssue),
    ...lineage.manifestIssues.map(toErrorIssue),
    ...sourceIssues,
  ];
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
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
        "Safety policy requires a Git checkpoint before agent writes, but this workspace is not inside a Git work tree. OKF Harness does not enforce automatic checkpoints in v0.3.2.",
    },
  ];
}

async function lintUnregisteredRawSources(
  workspaceRoot: string,
  rawSourcesPath: string,
  entries: SourceManifestEntry[],
): Promise<LintIssue[]> {
  const rawRoot = path.join(workspaceRoot, rawSourcesPath);
  const registeredPaths = new Set(entries.map((entry) => entry.path));
  let files: string[];
  try {
    files = await scanRawSourceFiles(rawRoot);
  } catch {
    return [workspaceReadIssue(rawSourcesPath)];
  }

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
        return [workspaceReadIssue(entry.path)];
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

function workspaceReadIssue(workspacePath: string): LintIssue {
  return {
    code: WORKSPACE_READ_FAILED,
    severity: "error",
    path: workspacePath,
    message: `Workspace data could not be read: ${workspacePath}`,
  };
}

function lintSourceLineage(
  dangling: ReconciliationEdge[],
  entries: SourceManifestEntry[],
): LintIssue[] {
  const paths = new Map(entries.map((entry) => [entry.id, entry.path]));
  return dangling.map(
    (edge) =>
      ({
        code: SOURCE_LINEAGE_SUSPECTED,
        severity: "warning",
        path: paths.get(edge.revisionSourceId) as string,
        message: `Source ${edge.revisionSourceId} may revise ${edge.priorSourceId}; both were registered as ${edge.original}.`,
      }) satisfies LintIssue,
  );
}

function lintMarkdownFile(file: OkfMarkdownFile): LintIssue[] {
  const issues: LintIssue[] = [];
  const document = okfDocumentView(file);

  if (file.isReserved && document.type !== undefined) {
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

    if (file.frontmatter.ok && document.type === undefined) {
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
    const document = okfDocumentView(file);
    const type = document.type?.toLocaleLowerCase();
    if (
      type === undefined ||
      !new Set(["topic", "entity", "project", "decision"]).has(type) ||
      hasOkfhSources(file.frontmatter.data) ||
      /^#\s+Citations\s*$/im.test(document.body)
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
