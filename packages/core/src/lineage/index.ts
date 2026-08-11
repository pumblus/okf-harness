import path from "node:path";
import {
  CONFIG_INVALID,
  readWorkspaceConfig,
  type WorkspaceConfig,
  WorkspaceConfigError,
} from "../config/index.js";
import { REFERENCE_SOURCE_MISSING } from "../lint/codes.js";
import {
  ConceptScanError,
  type OkfConcept,
  type OkfMarkdownFile,
  SCAN_FAILED,
  scanConcepts,
} from "../okf/concepts.js";
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
 * One consistent read of a workspace: the resolved root, config, full wiki scan,
 * source manifest, and reconciliation ledger, plus the deterministic facts
 * derived from them. Read-side entry points load exactly one snapshot per
 * invocation and thread it through, so every module observes the same workspace
 * state and the wiki tree is scanned once per command. Input failures are
 * captured on the snapshot so diagnostics identify the unreadable config, wiki,
 * manifest, or ledger rather than claiming a seal.
 */
export type WorkspaceSnapshot = {
  workspaceRoot: string;
  config: WorkspaceConfig | undefined;
  bundleRoot: string | undefined;
  files: OkfMarkdownFile[];
  concepts: OkfConcept[];
  conceptCount: number;
  /** Promoted source → reference document paths; the currency seal's fact base. */
  referencePathsBySource: ReadonlyMap<string, string[]>;
  referenceLinks: ReferenceSourceLink[];
  referenceIssues: LineageIssue[];
  manifestEntries: SourceManifestEntry[];
  manifestIssues: SourceManifestIssue[];
  ledgerIssues: ReconciliationLedgerIssue[];
  issues: LineageIssue[];
  dangling: ReconciliationEdge[];
};

export async function readWorkspaceSnapshot(
  workspaceRootInput: string,
): Promise<WorkspaceSnapshot> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const configResult = await readWorkspaceConfig(workspaceRoot);
  if (!configResult.ok) {
    return emptySnapshot(
      workspaceRoot,
      undefined,
      configResult.bundleRoot,
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

  const referencePathsBySource = new Map<string, string[]>();
  for (const link of referenceFacts.links) {
    const paths = referencePathsBySource.get(link.sourceId) ?? [];
    paths.push(link.referencePath);
    referencePathsBySource.set(link.sourceId, paths);
  }

  return {
    workspaceRoot,
    config,
    bundleRoot: config.okf.bundle_root,
    files: scan?.files ?? [],
    concepts: scan?.concepts ?? [],
    conceptCount: scan?.concepts.length ?? 0,
    referencePathsBySource,
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

/**
 * Throws the scan failure a direct workspace read would hit. Entry points that
 * fail on a broken wiki (read, search, graph, evidence) call this after loading
 * a snapshot; entry points that degrade gracefully (lint, check, status) use
 * the snapshot's captured issues instead.
 */
export function assertSnapshotScannable(snapshot: WorkspaceSnapshot): void {
  const scanIssue = snapshot.issues.find((issue) => issue.code === SCAN_FAILED);
  if (scanIssue !== undefined) {
    throw new ConceptScanError(scanIssue.message, { wikiRoot: snapshot.bundleRoot });
  }
}

/**
 * Throws the config or scan failure a direct workspace read would hit.
 * Evidence calls only assertSnapshotScannable: an unreadable config degrades
 * into the unanchored-seal path instead of failing.
 */
export function assertSnapshotReadable(snapshot: WorkspaceSnapshot): void {
  if (snapshot.config === undefined) {
    throw new WorkspaceConfigError(
      snapshot.issues
        .filter((issue) => issue.code === CONFIG_INVALID)
        .map((issue) => ({
          code: CONFIG_INVALID,
          path: issue.path,
          message: issue.message,
        })),
    );
  }

  assertSnapshotScannable(snapshot);
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

function emptySnapshot(
  workspaceRoot: string,
  config: WorkspaceConfig | undefined,
  bundleRoot: string | undefined,
  issues: LineageIssue[],
): WorkspaceSnapshot {
  return {
    workspaceRoot,
    config,
    bundleRoot,
    files: [],
    concepts: [],
    conceptCount: 0,
    referencePathsBySource: new Map(),
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
