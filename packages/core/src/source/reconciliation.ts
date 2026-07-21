import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadWorkspaceConfig, type WorkspaceConfig } from "../config/index.js";
import {
  MANIFEST_INVALID,
  readSourceManifest,
  SOURCE_NOT_REGISTERED,
  SourceManagementError,
  type SourceManifestEntry,
} from "./index.js";
import { errorCode, isSourceId, type JsonlRow, readJsonlRows } from "./jsonl.js";

export const RECONCILIATION_EDGE_UNKNOWN = "RECONCILIATION_EDGE_UNKNOWN" as const;
export const RECONCILIATION_LEDGER_INVALID = "RECONCILIATION_LEDGER_INVALID" as const;
export const RECONCILIATION_LEDGER_PATH_UNSAFE = "RECONCILIATION_LEDGER_PATH_UNSAFE" as const;
export const RECONCILIATION_NOTE_REQUIRED = "RECONCILIATION_NOTE_REQUIRED" as const;

export type ReconciliationAcknowledgement = {
  prior_source_id: string;
  revision_source_id: string;
  note: string;
};

/**
 * One suspected-revision edge: a later-registered file source suspected to revise an
 * earlier sibling that shares its original filename but differs in content hash.
 */
export type ReconciliationEdge = {
  original: string;
  priorSourceId: string;
  revisionSourceId: string;
};

/** Backward-compatible name for an unacknowledged reconciliation edge. */
export type DanglingReconciliation = ReconciliationEdge;

export type ReconciliationLedgerIssue = {
  code: typeof RECONCILIATION_LEDGER_INVALID;
  message: string;
  path: string;
  line: number;
};

export type ReconciliationLedgerReadResult = {
  entries: ReconciliationAcknowledgement[];
  issues: ReconciliationLedgerIssue[];
};

export type ClearReconciliationOptions = {
  workspaceRoot: string;
  priorSourceId: string;
  revisionSourceId: string;
  note: string;
};

export type ClearReconciliationResult = {
  workspaceRoot: string;
  ledgerPath: string;
  acknowledgement: ReconciliationAcknowledgement;
};

/**
 * The ledger lives beside the manifest, which keeps acknowledgment state with the
 * rest of the workspace's wiki state. `raw/` is immutable by design, so a workspace
 * that points its manifest there cannot host the ledger.
 */
export function reconciliationLedgerPath(config: WorkspaceConfig): string {
  const directory = path.posix.dirname(config.paths.manifest);
  const ledgerPath =
    directory === "." ? "reconciliation.jsonl" : `${directory}/reconciliation.jsonl`;
  for (const immutableRoot of [config.paths.raw_sources, config.paths.raw_inbox]) {
    if (ledgerPath === immutableRoot || ledgerPath.startsWith(`${immutableRoot}/`)) {
      throw new SourceManagementError(
        `Reconciliation ledger would fall under immutable ${immutableRoot}; move paths.manifest out of it.`,
        RECONCILIATION_LEDGER_PATH_UNSAFE,
      );
    }
  }
  return ledgerPath;
}

export function isReconciledEdge(
  entries: ReconciliationAcknowledgement[],
  priorSourceId: string,
  revisionSourceId: string,
): boolean {
  return entries.some(
    (entry) =>
      entry.prior_source_id === priorSourceId && entry.revision_source_id === revisionSourceId,
  );
}

/**
 * Suspected-revision edges derived from the manifest alone, recomputed every call.
 * File sources sharing an original filename form a group in added order; the latest
 * entry is the suspected revision of each earlier sibling with a different hash.
 */
export function suspectedRevisions(entries: SourceManifestEntry[]): ReconciliationEdge[] {
  const entriesByOriginal = new Map<string, SourceManifestEntry[]>();
  for (const entry of entries) {
    if (entry.kind !== "file") {
      continue;
    }
    const siblings = entriesByOriginal.get(entry.original) ?? [];
    siblings.push(entry);
    entriesByOriginal.set(entry.original, siblings);
  }

  return [...entriesByOriginal.values()].flatMap((siblings) => {
    const revision = siblings.at(-1);
    if (revision === undefined) {
      return [];
    }
    return siblings.slice(0, -1).flatMap((prior) =>
      prior.sha256 === revision.sha256
        ? []
        : [
            {
              original: revision.original,
              priorSourceId: prior.id,
              revisionSourceId: revision.id,
            } satisfies ReconciliationEdge,
          ],
    );
  });
}

/** Suspected-revision edges no acknowledgment covers yet. */
export function danglingReconciliations(
  entries: SourceManifestEntry[],
  acknowledgements: ReconciliationAcknowledgement[],
): ReconciliationEdge[] {
  return suspectedRevisions(entries).filter(
    (edge) => !isReconciledEdge(acknowledgements, edge.priorSourceId, edge.revisionSourceId),
  );
}

export async function clearReconciliation(
  options: ClearReconciliationOptions,
): Promise<ClearReconciliationResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const manifest = await readSourceManifest(workspaceRoot, config);
  if (manifest.issues.length > 0) {
    throw new SourceManagementError("Source manifest contains invalid rows.", MANIFEST_INVALID);
  }

  for (const sourceId of [options.priorSourceId, options.revisionSourceId]) {
    if (!manifest.entries.some((entry) => entry.id === sourceId)) {
      throw new SourceManagementError(
        `Source is not registered: ${sourceId}`,
        SOURCE_NOT_REGISTERED,
        workspaceRoot,
      );
    }
  }

  const note = options.note.trim();
  if (note.length === 0) {
    throw new SourceManagementError(
      "Reconciliation requires a non-empty judgment note.",
      RECONCILIATION_NOTE_REQUIRED,
      workspaceRoot,
    );
  }

  const edge = suspectedRevisions(manifest.entries).find(
    (candidate) =>
      candidate.priorSourceId === options.priorSourceId &&
      candidate.revisionSourceId === options.revisionSourceId,
  );
  if (edge === undefined) {
    throw new SourceManagementError(
      `No suspected-revision edge from ${options.priorSourceId} to ${options.revisionSourceId}.`,
      RECONCILIATION_EDGE_UNKNOWN,
      workspaceRoot,
    );
  }

  const ledger = await readReconciliationLedger(workspaceRoot, config);
  if (ledger.issues.length > 0) {
    throw new SourceManagementError(
      "Reconciliation ledger contains invalid rows.",
      RECONCILIATION_LEDGER_INVALID,
      workspaceRoot,
    );
  }

  const acknowledgement: ReconciliationAcknowledgement = {
    prior_source_id: edge.priorSourceId,
    revision_source_id: edge.revisionSourceId,
    note,
  };
  const ledgerPath = reconciliationLedgerPath(config);
  const absoluteLedgerPath = path.join(workspaceRoot, ledgerPath);
  await mkdir(path.dirname(absoluteLedgerPath), { recursive: true });
  await appendFile(absoluteLedgerPath, `${JSON.stringify(acknowledgement)}\n`, "utf8");

  return { workspaceRoot, ledgerPath, acknowledgement };
}

export async function readReconciliationLedger(
  workspaceRootInput: string,
  config?: WorkspaceConfig,
): Promise<ReconciliationLedgerReadResult> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const workspaceConfig = config ?? (await loadWorkspaceConfig(workspaceRoot));
  const ledgerPath = reconciliationLedgerPath(workspaceConfig);
  const entries: ReconciliationAcknowledgement[] = [];
  const issues: ReconciliationLedgerIssue[] = [];
  let rows: JsonlRow[];
  try {
    rows = await readJsonlRows(path.join(workspaceRoot, ledgerPath));
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
    rows = [];
  }

  for (const row of rows) {
    if (!row.ok) {
      issues.push({
        code: RECONCILIATION_LEDGER_INVALID,
        path: ledgerPath,
        line: row.line,
        message: row.message,
      });
      continue;
    }

    const entry = parseAcknowledgement(row.value);
    if (entry.ok) {
      entries.push(entry.entry);
      continue;
    }

    issues.push({
      code: RECONCILIATION_LEDGER_INVALID,
      path: ledgerPath,
      line: row.line,
      message: entry.message,
    });
  }

  return { entries, issues };
}

function parseAcknowledgement(
  value: unknown,
): { ok: true; entry: ReconciliationAcknowledgement } | { ok: false; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, message: "Ledger row must be a JSON object." };
  }

  const row = value as Record<string, unknown>;
  const requiredStringFields = ["prior_source_id", "revision_source_id", "note"] as const;
  for (const field of requiredStringFields) {
    if (typeof row[field] !== "string" || row[field].trim().length === 0) {
      return { ok: false, message: `Ledger row is missing a non-empty ${field} field.` };
    }
  }

  for (const field of ["prior_source_id", "revision_source_id"] as const) {
    if (!isSourceId(String(row[field]))) {
      return { ok: false, message: `Ledger ${field} must match src_YYYYMMDD_NNNN.` };
    }
  }

  return {
    ok: true,
    entry: {
      prior_source_id: String(row.prior_source_id),
      revision_source_id: String(row.revision_source_id),
      note: String(row.note),
    },
  };
}
