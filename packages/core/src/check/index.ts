import { readWorkspaceSnapshot, type WorkspaceSnapshot } from "../lineage/index.js";
import {
  BROKEN_LINK,
  type LintIssue,
  type LintResult,
  lintWorkspaceFromSnapshot,
  OKF_INVALID_FRONTMATTER,
  OKF_MISSING_FRONTMATTER,
  OKF_MISSING_TYPE,
  REFERENCE_SOURCE_MISSING,
  RESERVED_FILE_HAS_CONCEPT_FRONTMATTER,
  SOURCE_HASH_DRIFT,
  SOURCE_MISSING,
  WORKSPACE_READ_FAILED,
} from "../lint/index.js";
import {
  RECONCILIATION_LEDGER_INVALID,
  type ReconciliationEdge,
} from "../source/reconciliation.js";

export type CheckStatus = "ready" | "needs_attention" | "blocked";
export type HarnessPriority = "high" | "medium" | "low";

export type CheckCurrency = {
  sealed: boolean;
  /**
   * How many distinct sources the wiki has promoted. Reporting only: it never
   * enters the seal computation, but it separates a seal earned over promoted
   * sources from one that is vacuously true because there are none.
   */
  promotedSources: number;
  dangling: Array<ReconciliationEdge & { promotedBy: string[] }>;
  /**
   * Deterministic diagnostics explaining why currency could not be verified
   * (unreadable or invalid config, manifest, ledger, or reference data).
   * Empty when the seal was computed from fully readable facts.
   */
  diagnostics: LintIssue[];
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

export type CheckPipelineResult = {
  lint: LintResult;
  check: CheckResult;
};

/**
 * The one place the lineage → lint → currency → check assembly happens. All
 * consumers (checkWorkspace, readWorkspaceStatus, planEvidenceBrief) compose
 * this instead of re-assembling the pipeline, so lint, the currency seal, and
 * the check verdict always derive from the same snapshot and the same facts.
 */
export async function runCheckPipeline(snapshot: WorkspaceSnapshot): Promise<CheckPipelineResult> {
  const lint = await lintWorkspaceFromSnapshot(snapshot);
  return { lint, check: checkLintResult(lint, checkCurrencyFromSnapshot(snapshot, lint)) };
}

export async function checkWorkspace(workspaceRoot: string): Promise<CheckResult> {
  return (await runCheckPipeline(await readWorkspaceSnapshot(workspaceRoot))).check;
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

export function checkCurrencyFromSnapshot(
  snapshot: WorkspaceSnapshot,
  lint: LintResult,
): CheckCurrency {
  const promotedBySource = snapshot.referencePathsBySource;
  const promotedSources = promotedBySource.size;

  const diagnostics = lint.issues.filter((issue) => issue.severity === "error");
  if (diagnostics.length > 0) {
    return { sealed: false, promotedSources, dangling: [], diagnostics };
  }

  const dangling = snapshot.dangling.flatMap((edge) => {
    const promotedBy = [
      ...(promotedBySource.get(edge.priorSourceId) ?? []),
      ...(promotedBySource.get(edge.revisionSourceId) ?? []),
    ];
    return promotedBy.length === 0 ? [] : [{ ...edge, promotedBy: [...new Set(promotedBy)] }];
  });
  return { sealed: dangling.length === 0, promotedSources, dangling, diagnostics };
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
    issue.code === WORKSPACE_READ_FAILED ||
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
    issue.code === RESERVED_FILE_HAS_CONCEPT_FRONTMATTER
  );
}
