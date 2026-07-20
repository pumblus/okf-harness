import { readWorkspaceConfig, type WorkspaceConfig } from "../config/index.js";
import { REFERENCE_SOURCE_MISSING } from "../lint/codes.js";
import { type OkfMarkdownFile, SCAN_FAILED, scanConcepts } from "../okf/concepts.js";
import {
  MANIFEST_INVALID,
  readSourceManifest,
  type SourceManifestEntry,
  type SourceManifestIssue,
  type SourceManifestReadResult,
} from "../source/index.js";
import {
  danglingReconciliations,
  RECONCILIATION_LEDGER_INVALID,
  type ReconciliationEdge,
  type ReconciliationLedgerIssue,
  type ReconciliationLedgerReadResult,
  readReconciliationLedger,
  reconciliationLedgerPath,
} from "../source/reconciliation.js";

export type ReferenceSourceLink = {
  sourceId: string;
  referencePath: string;
};

/** Structurally assignable to LintIssue. */
export type LineageIssue = {
  code: string;
  severity: "error";
  message: string;
  path: string;
  line?: number;
};

/**
 * Shared deterministic lineage/reconciliation facts behind Harness lint and the
 * currency seal. Input failures are captured separately so diagnostics identify
 * the unreadable config, wiki, manifest, or ledger rather than claiming a seal.
 */
export type WorkspaceLineage = {
  config: WorkspaceConfig | undefined;
  files: OkfMarkdownFile[];
  conceptCount: number;
  referenceLinks: ReferenceSourceLink[];
  referenceIssues: LineageIssue[];
  manifestEntries: SourceManifestEntry[];
  manifestIssues: SourceManifestIssue[];
  ledgerIssues: ReconciliationLedgerIssue[];
  issues: LineageIssue[];
  dangling: ReconciliationEdge[];
};

export async function readWorkspaceLineage(workspaceRoot: string): Promise<WorkspaceLineage> {
  const configResult = await readWorkspaceConfig(workspaceRoot);
  if (!configResult.ok) {
    return emptyLineage(
      undefined,
      configResult.issues.map((issue) => ({ ...issue, severity: "error" as const })),
    );
  }

  const config = configResult.config;
  const ledgerPath = safeLedgerPath(config);
  const [scanRead, manifestRead, ledgerRead] = await Promise.all([
    tryRead(
      () => scanConcepts(workspaceRoot, config),
      (error) => readIssue(SCAN_FAILED, config.okf.bundle_root, error, "Could not scan OKF wiki."),
    ),
    tryRead(
      () => readSourceManifest(workspaceRoot, config),
      (error) =>
        readIssue(
          MANIFEST_INVALID,
          config.paths.manifest,
          error,
          "Could not read source manifest.",
        ),
    ),
    tryRead(
      () => readReconciliationLedger(workspaceRoot, config),
      (error) =>
        readIssue(
          reconciliationErrorCode(error),
          ledgerPath,
          error,
          "Could not read reconciliation ledger.",
        ),
    ),
  ]);

  const scan = scanRead.ok ? scanRead.value : undefined;
  const manifest = manifestRead.ok ? manifestRead.value : emptyManifest();
  const ledger = ledgerRead.ok ? ledgerRead.value : emptyLedger();
  const referenceFacts =
    scan !== undefined && manifestRead.ok && manifest.issues.length === 0
      ? deriveReferenceFacts(scan.files, manifest.entries)
      : { links: [], issues: [] };
  const canDeriveReconciliations =
    manifestRead.ok && manifest.issues.length === 0 && ledgerRead.ok && ledger.issues.length === 0;

  return {
    config,
    files: scan?.files ?? [],
    conceptCount: scan?.concepts.length ?? 0,
    referenceLinks: referenceFacts.links,
    referenceIssues: referenceFacts.issues,
    manifestEntries: manifest.entries,
    manifestIssues: manifest.issues,
    ledgerIssues: ledger.issues,
    issues: [scanRead, manifestRead, ledgerRead].flatMap((read) => (read.ok ? [] : [read.issue])),
    dangling: canDeriveReconciliations
      ? danglingReconciliations(manifest.entries, ledger.entries)
      : [],
  };
}

/** Reference document → source id links, the deterministic promotion facts. */
export function referenceSourceLinks(files: OkfMarkdownFile[]): ReferenceSourceLink[] {
  return deriveReferenceFacts(files).links;
}

/** Map a manifest or ledger row issue to an error-severity diagnostic. */
export function toErrorIssue(issue: {
  code: string;
  message: string;
  path: string;
  line: number;
}): LineageIssue {
  return {
    code: issue.code,
    severity: "error",
    message: issue.message,
    path: issue.path,
    line: issue.line,
  };
}

type ReadResult<T> = { ok: true; value: T } | { ok: false; issue: LineageIssue };

async function tryRead<T>(
  read: () => Promise<T>,
  issue: (error: unknown) => LineageIssue,
): Promise<ReadResult<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, issue: issue(error) };
  }
}

function deriveReferenceFacts(
  files: OkfMarkdownFile[],
  manifestEntries?: SourceManifestEntry[],
): { links: ReferenceSourceLink[]; issues: LineageIssue[] } {
  const sourceIds = new Set(manifestEntries?.map((entry) => entry.id) ?? []);
  const validateSourceIds = manifestEntries !== undefined;
  const links: ReferenceSourceLink[] = [];
  const issues: LineageIssue[] = [];

  for (const file of files) {
    if (file.isReserved || !file.bundlePath.startsWith("references/")) {
      continue;
    }
    if (!file.frontmatter.ok) {
      continue;
    }

    const sourceId = frontmatterSourceId(file.frontmatter.data);
    if (sourceId === undefined) {
      continue;
    }
    links.push({ sourceId, referencePath: file.workspacePath });
    if (validateSourceIds && !sourceIds.has(sourceId)) {
      issues.push({
        code: REFERENCE_SOURCE_MISSING,
        severity: "error",
        path: file.workspacePath,
        message: `Reference document points to an unregistered source id: ${sourceId}`,
      });
    }
  }

  return { links, issues };
}

function emptyLineage(
  config: WorkspaceConfig | undefined,
  issues: LineageIssue[],
): WorkspaceLineage {
  return {
    config,
    files: [],
    conceptCount: 0,
    referenceLinks: [],
    referenceIssues: [],
    manifestEntries: [],
    manifestIssues: [],
    ledgerIssues: [],
    issues,
    dangling: [],
  };
}

function emptyManifest(): SourceManifestReadResult {
  return { entries: [], issues: [] };
}

function emptyLedger(): ReconciliationLedgerReadResult {
  return { entries: [], issues: [] };
}

function readIssue(code: string, path: string, error: unknown, fallback: string): LineageIssue {
  return {
    code,
    severity: "error",
    path,
    message: error instanceof Error ? error.message : fallback,
  };
}

function safeLedgerPath(config: WorkspaceConfig): string {
  try {
    return reconciliationLedgerPath(config);
  } catch {
    return config.paths.manifest;
  }
}

function reconciliationErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.startsWith("RECONCILIATION_")) {
      return code;
    }
  }
  return RECONCILIATION_LEDGER_INVALID;
}

function frontmatterSourceId(frontmatter: Record<string, unknown>): string | undefined {
  const okfh = frontmatter.okfh;
  if (typeof okfh !== "object" || okfh === null || Array.isArray(okfh)) {
    return undefined;
  }
  const sourceId = (okfh as { source_id?: unknown }).source_id;
  return typeof sourceId === "string" && sourceId.trim().length > 0 ? sourceId : undefined;
}
