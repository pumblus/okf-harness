import { CONFIG_INVALID, readWorkspaceConfig } from "../config/index.js";
import { type OkfMarkdownFile, scanConcepts } from "../okf/concepts.js";

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
    const issues = scanResult.files.flatMap((file) => lintMarkdownFile(file));
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

function lintMarkdownFile(file: OkfMarkdownFile): LintIssue[] {
  const issues: LintIssue[] = [];

  if (file.frontmatter.ok && file.isReserved && hasFrontmatterData(file)) {
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

function hasFrontmatterData(file: OkfMarkdownFile): boolean {
  return file.frontmatter.ok && Object.keys(file.frontmatter.data).length > 0;
}

function hasNonEmptyType(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
