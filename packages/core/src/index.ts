export const packageInfo = {
  name: "@okf-harness/core",
  role: "core",
} as const;

export type PackageInfo = typeof packageInfo;

export {
  type CheckCurrency,
  type CheckResult,
  type CheckStatus,
  checkLintResult,
  checkWorkspace,
  type HarnessPriority,
  readCheckCurrency,
} from "./check/index.js";
export * from "./config/index.js";
export * from "./evidence/index.js";
export * from "./graph/index.js";
export {
  BROKEN_LINK,
  GIT_CHECKPOINT_POLICY_NOT_ENFORCED,
  type LintIssue,
  type LintResult,
  type LintSeverity,
  LOG_INVALID_DATE_HEADING,
  lintWorkspace,
  MISSING_CITATIONS_SECTION,
  MISSING_INDEX_ENTRY,
  OKF_INVALID_FRONTMATTER,
  OKF_MISSING_FRONTMATTER,
  OKF_MISSING_TYPE,
  REFERENCE_SOURCE_MISSING,
  RESERVED_FILE_HAS_CONCEPT_FRONTMATTER,
  type ReferenceSourceLink,
  referenceSourceLinks,
  SOURCE_HASH_DRIFT,
  SOURCE_LINEAGE_SUSPECTED,
  SOURCE_MISSING,
  WORKSPACE_READ_FAILED,
} from "./lint/index.js";
export * from "./okf/concepts.js";
export * from "./okf/frontmatter.js";
export * from "./okf/links.js";
export * from "./paths/index.js";
export * from "./read/index.js";
export * from "./search/index.js";
export * from "./source/index.js";
export * from "./source/ingest.js";
export * from "./source/reconciliation.js";
export * from "./workspace/index.js";
