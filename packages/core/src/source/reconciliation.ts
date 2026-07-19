import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadWorkspaceConfig, type WorkspaceConfig } from "../config/index.js";
import {
  MANIFEST_INVALID,
  readSourceManifest,
  SOURCE_NOT_REGISTERED,
  SourceManagementError,
} from "./index.js";
import { isSourceId, readJsonlRows } from "./jsonl.js";

export const RECONCILIATION_LEDGER_INVALID = "RECONCILIATION_LEDGER_INVALID" as const;
export const RECONCILIATION_LEDGER_PATH_UNSAFE = "RECONCILIATION_LEDGER_PATH_UNSAFE" as const;
export const RECONCILIATION_NOTE_REQUIRED = "RECONCILIATION_NOTE_REQUIRED" as const;

export type ReconciliationAcknowledgement = {
  prior_source_id: string;
  revision_source_id: string;
  note: string;
  acknowledged_at: string;
};

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
  now?: Date;
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

  const acknowledgement: ReconciliationAcknowledgement = {
    prior_source_id: options.priorSourceId,
    revision_source_id: options.revisionSourceId,
    note,
    acknowledged_at: (options.now ?? new Date()).toISOString(),
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

  for (const row of await readJsonlRows(path.join(workspaceRoot, ledgerPath))) {
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
  const requiredStringFields = [
    "prior_source_id",
    "revision_source_id",
    "note",
    "acknowledged_at",
  ] as const;
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
      acknowledged_at: String(row.acknowledged_at),
    },
  };
}
