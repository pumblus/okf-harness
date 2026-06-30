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
  reason: string;
};

export type IngestPlanSuggestedNewConcept = {
  type: "Topic";
  title: string;
  path: string;
  reason: string;
};

export type IngestPlanResult = {
  workspaceRoot: string;
  source: SourceManifestEntry;
  recommendedReferencePath: string;
  candidateConcepts: IngestPlanCandidateConcept[];
  suggestedNewConcept?: IngestPlanSuggestedNewConcept;
  nextStep: string;
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
  const suggestedTopic = suggestedTopicConcept(source);
  const contentConcepts = scanResult.concepts.filter(
    (concept) => !concept.id.startsWith("references/"),
  );
  const candidateConcepts = contentConcepts
    .map((concept) => {
      const conceptTokens = tokenize([
        concept.id,
        concept.title ?? "",
        concept.type,
        concept.tags.join(" "),
      ]);
      const matches = [...sourceTokens].filter((token) => conceptTokens.has(token));
      const matchesSuggestedTopicPath = concept.workspacePath === suggestedTopic.path;
      return {
        concept,
        matches,
        matchesSuggestedTopicPath,
      };
    })
    .filter((candidate) => candidate.matches.length > 0 || candidate.matchesSuggestedTopicPath)
    .map(({ concept, matches, matchesSuggestedTopicPath }) => {
      const candidate: IngestPlanCandidateConcept = {
        id: concept.id,
        path: concept.workspacePath,
        type: concept.type,
        reason: candidateReason(matches, matchesSuggestedTopicPath),
      };
      if (concept.title !== undefined) {
        candidate.title = concept.title;
      }
      return {
        candidate,
        rank: (matchesSuggestedTopicPath ? 1000 : 0) + matches.length,
      };
    })
    .sort(
      (left, right) =>
        right.rank - left.rank || left.candidate.id.localeCompare(right.candidate.id),
    )
    .slice(0, 5)
    .map(({ candidate }) => candidate);

  const recommendedReferencePath =
    source.reference_concept ??
    `wiki/references/${safeSlug(referenceTitle(source)) || source.id}.md`;
  const suggestedNewConcept =
    candidateConcepts.length === 0
      ? {
          ...suggestedTopic,
          reason: "metadata-derived Topic suggestion; confirm after reading the source.",
        }
      : undefined;
  const nextStep = nextStepForIngestPlan(
    source,
    recommendedReferencePath,
    candidateConcepts,
    suggestedNewConcept,
  );

  return {
    workspaceRoot,
    source,
    recommendedReferencePath,
    candidateConcepts,
    ...(suggestedNewConcept === undefined ? {} : { suggestedNewConcept }),
    nextStep,
    checklist: [
      `Read the full registered source at ${source.path} before writing wiki content.`,
      `Create or update exactly one reference document at ${recommendedReferencePath}.`,
      "Update only affected topic, entity, project, decision, or question concept documents.",
      `If the planned or actual wiki edit would exceed ${config.safety.max_files_changed_per_ingest} wiki files, stop and ask the user before editing more files.`,
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

function candidateReason(matches: string[], matchesSuggestedTopicPath: boolean): string {
  const reasons: string[] = [];
  if (matchesSuggestedTopicPath) {
    reasons.push("metadata-derived topic path already exists");
  }
  if (matches.length > 0) {
    reasons.push(`metadata token match: ${matches.sort().join(", ")}`);
  }
  return reasons.join("; ");
}

function suggestedTopicConcept(
  source: SourceManifestEntry,
): Omit<IngestPlanSuggestedNewConcept, "reason"> {
  const title = referenceTitle(source);
  return {
    type: "Topic",
    title,
    path: `wiki/topics/${safeSlug(title) || source.id}.md`,
  };
}

function nextStepForIngestPlan(
  source: SourceManifestEntry,
  recommendedReferencePath: string,
  candidateConcepts: IngestPlanCandidateConcept[],
  suggestedNewConcept: IngestPlanSuggestedNewConcept | undefined,
): string {
  if (suggestedNewConcept !== undefined) {
    return `Read ${source.path}, create or update ${recommendedReferencePath}, then confirm whether to create ${suggestedNewConcept.path}.`;
  }
  if (candidateConcepts.length > 0) {
    return `Read ${source.path}, create or update ${recommendedReferencePath}, then update only the listed candidate concepts that the source actually affects.`;
  }
  return `Read ${source.path}, create or update ${recommendedReferencePath}, then update only affected content pages.`;
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
