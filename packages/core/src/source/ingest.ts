import path from "node:path";
import { loadWorkspaceConfig } from "../config/index.js";
import { scanConcepts } from "../okf/concepts.js";
import { toPosixPath } from "../paths/index.js";
import {
  MANIFEST_INVALID,
  readSourceManifest,
  SOURCE_NOT_REGISTERED,
  SourceManagementError,
  type SourceManifestEntry,
} from "./index.js";
import { safeSlug, titleFromFilename, titleFromUrl } from "./metadata.js";

export type CreateIngestPlanOptions = {
  workspaceRoot: string;
  source: string;
};

export type IngestPlanCandidateConcept = {
  id: string;
  path: string;
  type: string;
  title?: string;
  score: number;
  reason: string;
};

export type IngestPlanResult = {
  workspaceRoot: string;
  source: SourceManifestEntry;
  recommendedReferencePath: string;
  candidateConcepts: IngestPlanCandidateConcept[];
  checklist: string[];
};

export async function createIngestPlan(
  options: CreateIngestPlanOptions,
): Promise<IngestPlanResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const manifest = await readSourceManifest(workspaceRoot, config);
  if (manifest.issues.length > 0) {
    throw new SourceManagementError("Source manifest contains invalid rows.", MANIFEST_INVALID);
  }

  const source = findRegisteredSource(manifest.entries, options.source);
  if (source === undefined) {
    throw new SourceManagementError(
      `Source is not registered: ${options.source}`,
      SOURCE_NOT_REGISTERED,
      workspaceRoot,
    );
  }

  const scanResult = await scanConcepts(workspaceRoot, config);
  const sourceTokens = tokenizeSourceMetadata(source);
  const candidateConcepts = scanResult.concepts
    .filter((concept) => !concept.id.startsWith("references/"))
    .map((concept) => {
      const conceptTokens = tokenize([
        concept.id,
        concept.title ?? "",
        concept.type,
        concept.tags.join(" "),
      ]);
      const matches = [...sourceTokens].filter((token) => conceptTokens.has(token));
      return {
        concept,
        matches,
      };
    })
    .filter((candidate) => candidate.matches.length > 0)
    .map(({ concept, matches }) => {
      const candidate: IngestPlanCandidateConcept = {
        id: concept.id,
        path: concept.workspacePath,
        type: concept.type,
        score: matches.length,
        reason: `metadata token match: ${matches.sort().join(", ")}`,
      };
      if (concept.title !== undefined) {
        candidate.title = concept.title;
      }
      return candidate;
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 10);

  const recommendedReferencePath =
    source.reference_concept ??
    `wiki/references/${safeSlug(referenceTitle(source)) || source.id}.md`;

  return {
    workspaceRoot,
    source,
    recommendedReferencePath,
    candidateConcepts,
    checklist: [
      `Read the full registered source at ${source.path} before writing wiki content.`,
      `Create or update exactly one reference document at ${recommendedReferencePath}.`,
      "Update only affected topic, entity, project, decision, or question concept documents.",
      "Preserve uncertainty and contradictions; do not invent claims or citations.",
      "Run okfh check --workspace <workspace> --json after wiki edits.",
    ],
  };
}

function findRegisteredSource(
  entries: SourceManifestEntry[],
  sourceInput: string,
): SourceManifestEntry | undefined {
  const normalizedInput = toPosixPath(sourceInput);
  return entries.find(
    (entry) =>
      entry.id === sourceInput ||
      entry.path === normalizedInput ||
      path.posix.basename(entry.path) === normalizedInput,
  );
}

function tokenizeSourceMetadata(source: SourceManifestEntry): Set<string> {
  return tokenize([source.id, source.original, source.path, source.title ?? ""]);
}

function tokenize(values: string[]): Set<string> {
  return new Set(
    values
      .join(" ")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^\p{Letter}\p{Number}]+/u)
      .filter((token) => token.length >= 3 && !metadataStopWords.has(token)),
  );
}

function referenceTitle(source: SourceManifestEntry): string {
  if (source.title !== undefined) {
    return source.title;
  }
  if (source.kind === "file") {
    return titleFromFilename(source.original);
  }
  return titleFromUrl(new URL(source.original));
}

const metadataStopWords = new Set([
  "raw",
  "sources",
  "source",
  "http",
  "https",
  "www",
  "com",
  "org",
  "net",
]);
