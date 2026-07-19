import {
  BROKEN_LINK,
  type LintIssue,
  type LintResult,
  LOG_INVALID_DATE_HEADING,
  lintWorkspace,
  OKF_INVALID_FRONTMATTER,
  OKF_MISSING_FRONTMATTER,
  OKF_MISSING_TYPE,
  REFERENCE_SOURCE_MISSING,
  RESERVED_FILE_HAS_CONCEPT_FRONTMATTER,
  SOURCE_HASH_DRIFT,
  SOURCE_MISSING,
} from "../lint/index.js";
import { RECONCILIATION_LEDGER_INVALID } from "../source/reconciliation.js";

export type CheckStatus = "ready" | "needs_attention" | "blocked";
export type HarnessPriority = "high" | "medium" | "low";

export type CheckResult = {
  status: CheckStatus;
  okfVersion: "0.1";
  okfConformance: {
    ok: boolean;
    findings: LintIssue[];
  };
  harnessLint: {
    ok: boolean;
    findings: Record<HarnessPriority, LintIssue[]>;
  };
};

export async function checkWorkspace(workspaceRoot: string): Promise<CheckResult> {
  const lint = await lintWorkspace(workspaceRoot);
  return checkLintResult(lint);
}

export function checkLintResult(lint: LintResult): CheckResult {
  const okfFindings = lint.issues.filter(isOkfConformanceFinding);
  const harnessFindings = groupHarnessFindings(
    lint.issues.filter((issue) => !isOkfConformanceFinding(issue)),
  );
  const harnessOk = Object.values(harnessFindings).every((findings) => findings.length === 0);

  return {
    status: okfFindings.length > 0 ? "blocked" : harnessOk ? "ready" : "needs_attention",
    okfVersion: "0.1",
    okfConformance: {
      ok: okfFindings.length === 0,
      findings: okfFindings,
    },
    harnessLint: {
      ok: harnessOk,
      findings: harnessFindings,
    },
  };
}

function groupHarnessFindings(issues: LintIssue[]): Record<HarnessPriority, LintIssue[]> {
  const findings: Record<HarnessPriority, LintIssue[]> = {
    high: [],
    medium: [],
    low: [],
  };

  for (const issue of issues) {
    findings[harnessPriorityFor(issue)].push(issue);
  }

  return findings;
}

function harnessPriorityFor(issue: LintIssue): HarnessPriority {
  if (issue.code === BROKEN_LINK) {
    return "low";
  }

  if (
    issue.code.startsWith("MANIFEST_") ||
    issue.code === SOURCE_HASH_DRIFT ||
    issue.code === SOURCE_MISSING ||
    issue.code === REFERENCE_SOURCE_MISSING ||
    issue.code === RECONCILIATION_LEDGER_INVALID
  ) {
    return "high";
  }

  return "medium";
}

function isOkfConformanceFinding(issue: LintIssue): boolean {
  return (
    issue.code === OKF_MISSING_FRONTMATTER ||
    issue.code === OKF_INVALID_FRONTMATTER ||
    issue.code === OKF_MISSING_TYPE ||
    issue.code === RESERVED_FILE_HAS_CONCEPT_FRONTMATTER ||
    issue.code === LOG_INVALID_DATE_HEADING
  );
}
