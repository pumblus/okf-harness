import { readWorkspaceConfig } from "../config/index.js";
import {
  BROKEN_LINK,
  danglingReconciliations,
  type LintIssue,
  type LintResult,
  LOG_INVALID_DATE_HEADING,
  lintWorkspace,
  OKF_INVALID_FRONTMATTER,
  OKF_MISSING_FRONTMATTER,
  OKF_MISSING_TYPE,
  REFERENCE_SOURCE_MISSING,
  RESERVED_FILE_HAS_CONCEPT_FRONTMATTER,
  referenceSourceLinks,
  SOURCE_HASH_DRIFT,
  SOURCE_MISSING,
} from "../lint/index.js";
import { scanConcepts } from "../okf/concepts.js";
import { readSourceManifest } from "../source/index.js";
import {
  RECONCILIATION_LEDGER_INVALID,
  readReconciliationLedger,
} from "../source/reconciliation.js";

export type CheckStatus = "ready" | "needs_attention" | "blocked";
export type HarnessPriority = "high" | "medium" | "low";

export type CheckCurrency = {
  sealed: boolean;
  dangling: Array<{
    original: string;
    priorSourceId: string;
    revisionSourceId: string;
    promotedBy: string[];
  }>;
};

export type CheckResult = {
  status: CheckStatus;
  okfVersion: "0.1";
  currency: CheckCurrency;
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
  const [lint, currency] = await Promise.all([
    lintWorkspace(workspaceRoot),
    readCheckCurrency(workspaceRoot),
  ]);
  return checkLintResult(lint, currency);
}

export function checkLintResult(lint: LintResult, currency: CheckCurrency): CheckResult {
  const okfFindings = lint.issues.filter(isOkfConformanceFinding);
  const harnessFindings = groupHarnessFindings(
    lint.issues.filter((issue) => !isOkfConformanceFinding(issue)),
  );
  const harnessOk = Object.values(harnessFindings).every((findings) => findings.length === 0);

  return {
    status: okfFindings.length > 0 ? "blocked" : harnessOk ? "ready" : "needs_attention",
    okfVersion: "0.1",
    currency,
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

export async function readCheckCurrency(workspaceRoot: string): Promise<CheckCurrency> {
  const configResult = await readWorkspaceConfig(workspaceRoot);
  if (!configResult.ok) {
    return { sealed: true, dangling: [] };
  }

  try {
    const [scan, manifest, ledger] = await Promise.all([
      scanConcepts(workspaceRoot, configResult.config),
      readSourceManifest(workspaceRoot, configResult.config),
      readReconciliationLedger(workspaceRoot, configResult.config),
    ]);
    const promotedBySource = new Map<string, string[]>();
    for (const { sourceId, referencePath } of referenceSourceLinks(scan.files)) {
      const paths = promotedBySource.get(sourceId) ?? [];
      paths.push(referencePath);
      promotedBySource.set(sourceId, paths);
    }

    const dangling = danglingReconciliations(manifest.entries, ledger.entries).flatMap((edge) => {
      const promotedBy = [
        ...(promotedBySource.get(edge.priorSourceId) ?? []),
        ...(promotedBySource.get(edge.revisionSourceId) ?? []),
      ];
      return promotedBy.length === 0 ? [] : [{ ...edge, promotedBy: [...new Set(promotedBy)] }];
    });
    return { sealed: dangling.length === 0, dangling };
  } catch {
    return { sealed: true, dangling: [] };
  }
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
