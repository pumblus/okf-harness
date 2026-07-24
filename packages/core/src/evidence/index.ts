import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  type CheckResult,
  checkCurrencyFromLineage,
  checkLintResult,
  type HarnessPriority,
} from "../check/index.js";
import { CONFIG_INVALID } from "../config/index.js";
import { buildWorkspaceGraphData, type GraphBacklinksData } from "../graph/index.js";
import { readWorkspaceLineage, type WorkspaceLineage } from "../lineage/index.js";
import {
  BROKEN_LINK,
  type LintIssue,
  lintWorkspaceFromLineage,
  MISSING_CITATIONS_SECTION,
  REFERENCE_SOURCE_MISSING,
  SOURCE_HASH_DRIFT,
  SOURCE_MISSING,
} from "../lint/index.js";
import { type OkfMarkdownFile, RESERVED_OKF_FILENAMES, scanConcepts } from "../okf/concepts.js";
import { safeResolveWorkspacePath, toPosixRelativePath } from "../paths/index.js";
import {
  type CitationIssue,
  type ReadCitation,
  type ReadContent,
  type ReadSection,
  readWorkspaceDocument,
} from "../read/index.js";
import type { SearchResultCard } from "../search/index.js";
import { type SearchWorkspaceResult, searchWorkspace } from "../search/index.js";
import { MANIFEST_INVALID, type SourceManifestEntry } from "../source/index.js";

export type EvidenceCandidate = {
  item: number;
  conceptId: string;
  path: string;
  title: string;
  type: string;
  matchedFields: string[];
  matchReasons: string[];
};

export type EvidenceBudgetPreset = keyof typeof evidenceBudgetPresets;

export type EvidenceContinuationCue = {
  target: string;
  offset: number;
  limit: number;
  command: string;
};

export type EvidenceSourcePointer = Pick<
  SourceManifestEntry,
  | "id"
  | "kind"
  | "original"
  | "path"
  | "sha256"
  | "added_at"
  | "mime"
  | "title"
  | "reference_concept"
>;

export type EvidenceReferencePointer = {
  target: string;
  exists: boolean;
  line: number;
  conceptId?: string;
  sourceIds: string[];
  sources: EvidenceSourcePointer[];
  citationIssues: CitationIssue[];
};

export type EvidenceItem = {
  item: number;
  conceptId: string;
  path: string;
  title: string;
  type: string;
  section?: {
    sectionId: string;
    heading: string;
    headingPath: string[];
    level: number;
  };
  range: {
    mode: ReadContent["mode"];
    startOffset: number;
    endOffset: number;
    contentLength: number;
    returnedChars: number;
    truncated: boolean;
  };
  continuationCues: EvidenceContinuationCue[];
  excerpt: string;
  matchedFields: string[];
  matchReasons: string[];
  provenance: {
    citations: ReadCitation[];
    citationIssues: CitationIssue[];
    references: EvidenceReferencePointer[];
    sourceIds: string[];
    sources: EvidenceSourcePointer[];
  };
};

export type EvidenceLimit = {
  code: string;
  message: string;
};

export type EvidenceWarning = SearchWorkspaceResult["warnings"][number] & {
  line?: number;
  severity?: LintIssue["severity"];
  priority?: HarnessPriority;
};

export type EvidenceSealCode =
  | typeof REFERENCE_SOURCE_MISSING
  | typeof SOURCE_HASH_DRIFT
  | typeof SOURCE_MISSING
  | typeof CONFIG_INVALID
  | typeof MANIFEST_INVALID;

export type EvidenceSeal = {
  code: EvidenceSealCode;
  sourceId?: string;
  sourcePath?: string;
  sealed: string[];
  basis: string;
};

export type EvidenceBriefResult = {
  workspaceRoot: string;
  question: string;
  budget: {
    preset: EvidenceBudgetPreset;
    maxChars: number;
    override: boolean;
    usedChars: number;
  };
  evidence: EvidenceItem[];
  candidates: EvidenceCandidate[];
  seals: EvidenceSeal[];
  limits: EvidenceLimit[];
  guidance: string[];
  warnings: EvidenceWarning[];
};

export type PlanEvidenceBriefOptions = {
  workspaceRoot: string;
  question: string;
  budget?: EvidenceBudgetPreset | undefined;
  maxChars?: number | undefined;
};

export const evidenceBudgetPresets = {
  compact: 256_000,
  standard: 400_000,
  large: 1_000_000,
} as const;

export const INVALID_EVIDENCE_BUDGET = "INVALID_EVIDENCE_BUDGET" as const;
export const EVIDENCE_WORKSPACE_BLOCKED = "EVIDENCE_WORKSPACE_BLOCKED" as const;

export class EvidenceBudgetError extends Error {
  readonly code = INVALID_EVIDENCE_BUDGET;

  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "EvidenceBudgetError";
  }
}

export class EvidenceWorkspaceBlockedError extends Error {
  readonly code = EVIDENCE_WORKSPACE_BLOCKED;

  constructor(readonly details: Record<string, unknown>) {
    super("OKF conformance is blocked; evidence cannot be prepared from this wiki.");
    this.name = "EvidenceWorkspaceBlockedError";
  }
}

const maxEvidenceItems = 3;
const defaultEvidenceBudgetPreset: EvidenceBudgetPreset = "standard";
const evidenceRiskCodes = new Set([
  BROKEN_LINK,
  CONFIG_INVALID,
  MISSING_CITATIONS_SECTION,
  REFERENCE_SOURCE_MISSING,
  SOURCE_HASH_DRIFT,
  SOURCE_MISSING,
  "UNREGISTERED_RAW_SOURCE",
]);
const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "by",
  "for",
  "in",
  "is",
  "of",
  "or",
  "the",
  "to",
]);

export async function planEvidenceBrief(
  options: PlanEvidenceBriefOptions,
): Promise<EvidenceBriefResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const budget = resolveEvidenceBudget(options);
  const lineage = await readWorkspaceLineage(workspaceRoot);
  const lint = await lintWorkspaceFromLineage(workspaceRoot, lineage);
  const check = checkLintResult(lint, checkCurrencyFromLineage(lineage, lint));
  if (check.status === "blocked") {
    throw new EvidenceWorkspaceBlockedError({
      okfConformanceFindings: check.okfConformance.findings,
    });
  }
  const riskWarnings = evidenceRiskWarnings(check);
  const unanchoredWarnings = riskWarnings.filter(
    (
      warning,
    ): warning is EvidenceWarning & {
      code: typeof CONFIG_INVALID | typeof MANIFEST_INVALID;
    } => warning.code === CONFIG_INVALID || warning.code === MANIFEST_INVALID,
  );
  if (unanchoredWarnings.length > 0) {
    const files =
      lineage.config === undefined
        ? lineage.bundleRoot === undefined
          ? await discoverBundleFiles(workspaceRoot)
          : (
              await scanConcepts(workspaceRoot, {
                okf: { bundle_root: lineage.bundleRoot },
              })
            ).files
        : lineage.files;
    const sealed = [
      ...new Set(files.filter((file) => !file.isReserved).map((file) => file.conceptId)),
    ].sort();
    return {
      workspaceRoot,
      question: options.question,
      budget: {
        preset: budget.preset,
        maxChars: budget.maxChars,
        override: budget.override,
        usedChars: 0,
      },
      evidence: [],
      candidates: [],
      seals: unanchoredWarnings.map((warning) => ({
        code: warning.code,
        sealed,
        basis: warning.message,
      })),
      limits: [],
      guidance: [
        "Treat this as a successful withheld-evidence result, not a command failure.",
        "Do not answer from documents named by a seal.",
      ],
      warnings: riskWarnings,
    };
  }
  const [search, graph] = await Promise.all([
    searchWorkspace({ workspaceRoot, query: options.question }),
    buildWorkspaceGraphData({ workspaceRoot }),
  ]);
  const seals = evidenceSeals(riskWarnings, lineage, graph);
  const sealedConceptIds = new Set(seals.flatMap((seal) => seal.sealed));
  const availableResults = search.results.filter(
    (result) => !sealedConceptIds.has(result.conceptId),
  );
  const evidenceResults = availableResults.slice(0, maxEvidenceItems);
  const candidates = availableResults.slice(maxEvidenceItems).map((result, index) => ({
    item: maxEvidenceItems + index + 1,
    conceptId: result.conceptId,
    path: result.path,
    title: result.title,
    type: result.type,
    matchedFields: result.matchedFields,
    matchReasons: candidateMatchReasons(result),
  }));
  const evidence = await evidenceItemsForResults(
    workspaceRoot,
    options.question,
    evidenceResults,
    budget.maxChars,
  );
  const usedChars = evidence.reduce((total, item) => total + item.range.returnedChars, 0);
  const truncated = evidence.some((item) => item.range.truncated);

  return {
    workspaceRoot,
    question: options.question,
    budget: {
      preset: budget.preset,
      maxChars: budget.maxChars,
      override: budget.override,
      usedChars,
    },
    evidence,
    candidates,
    seals,
    limits: evidenceLimits(search.totalMatches, truncated),
    guidance:
      search.totalMatches === 0
        ? [
            "Treat this as a successful no-match result, not a command failure.",
            "Disclose that the synthesized wiki has no evidence for the question unless the user asks to broaden the search.",
          ]
        : availableResults.length === 0
          ? [
              "Treat this as a successful withheld-evidence result, not a command failure.",
              "Do not answer from documents named by a seal.",
            ]
          : [
              "Use selected evidence excerpts as the bounded answer context.",
              "Use thin candidates only for bounded follow-up reads; do not treat unselected candidates as evidence.",
              ...(truncated
                ? ["Follow continuation cues with bounded okfh read calls only when needed."]
                : []),
            ],
    warnings: [...search.warnings, ...riskWarnings],
  };
}

async function discoverBundleFiles(workspaceRoot: string): Promise<OkfMarkdownFile[]> {
  try {
    const workspace = await safeResolveWorkspacePath(workspaceRoot, ".");
    const bundleRoots = await findInnermostBundleRoots(workspace.absolutePath);
    const files = await Promise.all(
      bundleRoots.map(async (bundleRoot) => {
        try {
          return (
            await scanConcepts(workspace.workspaceRoot, {
              okf: {
                bundle_root: toPosixRelativePath(workspace.workspaceRoot, bundleRoot) || ".",
              },
            })
          ).files;
        } catch {
          return [];
        }
      }),
    );
    return files
      .flat()
      .sort((left, right) => left.workspacePath.localeCompare(right.workspacePath));
  } catch {
    return [];
  }
}

async function findInnermostBundleRoots(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory() && ![".git", "node_modules"].includes(entry.name))
          .map((entry) => findInnermostBundleRoots(path.join(directory, entry.name))),
      )
    ).flat();
    if (nested.length > 0) {
      return nested;
    }
    const names = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    return [...RESERVED_OKF_FILENAMES].every((name) => names.has(name)) ? [directory] : [];
  } catch {
    return [];
  }
}

async function evidenceItemsForResults(
  workspaceRoot: string,
  question: string,
  results: SearchResultCard[],
  maxChars: number,
): Promise<EvidenceItem[]> {
  const evidence: EvidenceItem[] = [];
  let remainingChars = maxChars;
  for (const [index, result] of results.entries()) {
    const remainingItems = results.length - index;
    const itemLimit = Math.ceil(remainingChars / remainingItems);
    const item = await evidenceItemForResult(workspaceRoot, question, result, index, itemLimit);
    evidence.push(item);
    remainingChars = Math.max(0, remainingChars - item.range.returnedChars);
  }
  return evidence;
}

async function evidenceItemForResult(
  workspaceRoot: string,
  question: string,
  result: SearchResultCard,
  index: number,
  excerptLimit: number,
): Promise<EvidenceItem> {
  const document = await readWorkspaceDocument({ workspaceRoot, target: result.conceptId });
  const selected = await selectEvidenceExcerpt(
    workspaceRoot,
    question,
    result.conceptId,
    document,
    excerptLimit,
  );
  const range = rangeFromContent(selected.read.content);
  const provenance = await evidenceProvenance(workspaceRoot, selected.read);
  const item: EvidenceItem = {
    item: index + 1,
    conceptId: result.conceptId,
    path: result.path,
    title: result.title,
    type: result.type,
    range,
    continuationCues: continuationCuesForRange(
      workspaceRoot,
      result.conceptId,
      range,
      excerptLimit,
    ),
    excerpt: selected.read.content.text,
    matchedFields: result.matchedFields,
    matchReasons: evidenceMatchReasons(result, selected.matchReasons, selected.read.content.mode),
    provenance,
  };
  if (selected.section !== undefined) {
    item.section = {
      sectionId: selected.section.sectionId,
      heading: selected.section.heading,
      headingPath: selected.section.headingPath,
      level: selected.section.level,
    };
  }
  return item;
}

async function evidenceProvenance(
  workspaceRoot: string,
  read: Awaited<ReturnType<typeof readWorkspaceDocument>>,
): Promise<EvidenceItem["provenance"]> {
  const references = await Promise.all(
    read.citations
      .filter((citation): citation is Extract<ReadCitation, { kind: "reference" }> => {
        return citation.kind === "reference";
      })
      .map(async (citation): Promise<EvidenceReferencePointer> => {
        const base = {
          target: citation.target,
          exists: citation.exists,
          line: citation.line,
          ...(citation.conceptId === undefined ? {} : { conceptId: citation.conceptId }),
        };
        if (!citation.exists || citation.conceptId === undefined) {
          return { ...base, sourceIds: [], sources: [], citationIssues: [] };
        }

        const reference = await readWorkspaceDocument({
          workspaceRoot,
          target: citation.conceptId,
        });
        const sources = sourcePointersFromRead(reference);
        return {
          ...base,
          sourceIds: sourceIdsFromRead(reference),
          sources,
          citationIssues: reference.citationIssues,
        };
      }),
  );
  const sources = dedupeSources([
    ...sourcePointersFromRead(read),
    ...references.flatMap((reference) => reference.sources),
  ]);
  const sourceIds = [
    ...new Set([
      ...sourceIdsFromRead(read),
      ...references.flatMap((reference) => reference.sourceIds),
    ]),
  ].sort();

  return {
    citations: read.citations,
    citationIssues: read.citationIssues,
    references,
    sourceIds,
    sources,
  };
}

function sourceIdsFromRead(read: Awaited<ReturnType<typeof readWorkspaceDocument>>): string[] {
  const sourceIds = new Set<string>();
  if (read.source !== undefined) {
    sourceIds.add(read.source.id);
  }
  for (const citation of read.citations) {
    if (citation.kind === "source") {
      sourceIds.add(citation.sourceId);
    }
  }
  return [...sourceIds].sort();
}

function sourcePointersFromRead(
  read: Awaited<ReturnType<typeof readWorkspaceDocument>>,
): EvidenceSourcePointer[] {
  return dedupeSources([
    ...(read.source === undefined ? [] : [sourcePointer(read.source)]),
    ...read.citations.flatMap((citation) =>
      citation.kind === "source" && citation.source !== undefined
        ? [sourcePointer(citation.source)]
        : [],
    ),
  ]);
}

function dedupeSources(sources: EvidenceSourcePointer[]): EvidenceSourcePointer[] {
  return [...new Map(sources.map((source) => [source.id, source])).values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function sourcePointer(source: SourceManifestEntry): EvidenceSourcePointer {
  return {
    id: source.id,
    kind: source.kind,
    original: source.original,
    path: source.path,
    sha256: source.sha256,
    added_at: source.added_at,
    ...(source.mime === undefined ? {} : { mime: source.mime }),
    ...(source.title === undefined ? {} : { title: source.title }),
    ...(source.reference_concept === undefined
      ? {}
      : { reference_concept: source.reference_concept }),
  };
}

async function selectEvidenceExcerpt(
  workspaceRoot: string,
  question: string,
  target: string,
  document: Awaited<ReturnType<typeof readWorkspaceDocument>>,
  excerptLimit: number,
): Promise<{
  read: Awaited<ReturnType<typeof readWorkspaceDocument>>;
  section?: ReadSection;
  matchReasons: string[];
}> {
  const sections = document.availableSections.filter((section) => isEvidenceSection(section));
  if (sections.length === 0) {
    return {
      read: await readWorkspaceDocument({
        workspaceRoot,
        target,
        offset: 0,
        limit: excerptLimit,
      }),
      matchReasons: ["bounded range fallback"],
    };
  }

  const sectionReads = await Promise.all(
    sections.map(async (section) => ({
      section,
      read: await readWorkspaceDocument(
        section.endOffset - section.startOffset <= excerptLimit
          ? { workspaceRoot, target, sectionId: section.sectionId }
          : { workspaceRoot, target, offset: section.startOffset, limit: excerptLimit },
      ),
    })),
  );
  const rankedSectionReads = sectionReads
    .map((entry) => ({
      ...entry,
      match: sectionMatch(question, entry.section, entry.read.content.text),
    }))
    .sort(
      (left, right) =>
        right.match.score - left.match.score ||
        left.section.startOffset - right.section.startOffset,
    );
  const best = rankedSectionReads[0];
  if (best === undefined) {
    return {
      read: await readWorkspaceDocument({
        workspaceRoot,
        target,
        offset: 0,
        limit: excerptLimit,
      }),
      matchReasons: ["bounded range fallback"],
    };
  }

  return { read: best.read, section: best.section, matchReasons: best.match.reasons };
}

function candidateMatchReasons(result: SearchResultCard): string[] {
  return [...new Set(result.scoreBreakdown.map((item) => item.reason))];
}

function evidenceMatchReasons(
  result: SearchResultCard,
  sectionReasons: string[],
  mode: ReadContent["mode"],
): string[] {
  const reasons = new Set(candidateMatchReasons(result));
  for (const reason of sectionReasons) {
    reasons.add(reason);
  }
  if (mode === "range") {
    reasons.add("bounded range fallback");
  }
  return [...reasons];
}

function rangeFromContent(content: ReadContent): EvidenceItem["range"] {
  return {
    mode: content.mode,
    startOffset: content.startOffset,
    endOffset: content.endOffset,
    contentLength: content.contentLength,
    returnedChars: content.returnedChars,
    truncated: content.mode === "section" ? false : content.truncated,
  };
}

function continuationCuesForRange(
  workspaceRoot: string,
  target: string,
  range: EvidenceItem["range"],
  limit: number,
): EvidenceContinuationCue[] {
  if (!range.truncated) {
    return [];
  }
  const readLimit = Math.max(1, limit);
  return [
    {
      target,
      offset: range.endOffset,
      limit: readLimit,
      command: `okfh read --workspace ${shellQuote(workspaceRoot)} --offset ${range.endOffset} --limit ${readLimit} --json -- ${shellQuote(target)}`,
    },
  ];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function evidenceLimits(totalMatches: number, truncated: boolean): EvidenceLimit[] {
  if (totalMatches === 0) {
    return [
      {
        code: "NO_MATCHES",
        message: "No synthesized wiki concept documents matched the question.",
      },
    ];
  }
  return truncated
    ? [
        {
          code: "EVIDENCE_TRUNCATED",
          message: "One or more evidence items were truncated to fit the character budget.",
        },
      ]
    : [];
}

function evidenceSeals(
  warnings: EvidenceWarning[],
  lineage: WorkspaceLineage,
  graph: GraphBacklinksData,
): EvidenceSeal[] {
  const referencesBySource = new Map<string, Set<string>>();
  for (const { sourceId, referencePath } of lineage.referenceLinks) {
    const paths = referencesBySource.get(sourceId) ?? new Set<string>();
    paths.add(referencePath);
    referencesBySource.set(sourceId, paths);
  }
  const conceptIdByPath = new Map(graph.nodes.map((node) => [node.path, node.id]));

  return warnings
    .flatMap((warning): EvidenceSeal[] => {
      if (warning.code === SOURCE_MISSING || warning.code === SOURCE_HASH_DRIFT) {
        const source = lineage.manifestEntries.find((entry) => entry.path === warning.path);
        return source === undefined
          ? []
          : [
              sealForReferencePaths(
                warning.code,
                warning,
                source.id,
                source.path,
                referencesBySource.get(source.id) ?? new Set(),
                conceptIdByPath,
                graph,
              ),
            ];
      }
      if (warning.code !== REFERENCE_SOURCE_MISSING || warning.path === undefined) {
        return [];
      }
      return lineage.referenceLinks
        .filter((link) => link.referencePath === warning.path)
        .map((link) =>
          sealForReferencePaths(
            REFERENCE_SOURCE_MISSING,
            warning,
            link.sourceId,
            undefined,
            new Set([link.referencePath]),
            conceptIdByPath,
            graph,
          ),
        );
    })
    .sort(
      (left, right) =>
        left.code.localeCompare(right.code) ||
        (left.sourceId ?? "").localeCompare(right.sourceId ?? ""),
    );
}

function sealForReferencePaths(
  code: EvidenceSealCode,
  warning: EvidenceWarning,
  sourceId: string,
  sourcePath: string | undefined,
  referencePaths: Set<string>,
  conceptIdByPath: Map<string, string>,
  graph: GraphBacklinksData,
): EvidenceSeal {
  const referenceIds = new Set(
    [...referencePaths]
      .map((referencePath) => conceptIdByPath.get(referencePath))
      .filter((conceptId): conceptId is string => conceptId !== undefined),
  );
  const sealed = new Set(referenceIds);
  for (const edge of graph.edges) {
    if (edge.kind === "citation" && referenceIds.has(edge.to)) {
      sealed.add(edge.from);
    }
  }
  return {
    code,
    sourceId,
    ...(sourcePath === undefined ? {} : { sourcePath }),
    sealed: [...sealed].sort(),
    basis: warning.message,
  };
}

function evidenceRiskWarnings(check: CheckResult): EvidenceWarning[] {
  return (Object.entries(check.harnessLint.findings) as Array<[HarnessPriority, LintIssue[]]>)
    .flatMap(([priority, findings]) =>
      findings.filter(isEvidenceRisk).map((finding) => ({
        code: finding.code,
        message: finding.message,
        ...(finding.path === undefined ? {} : { path: finding.path }),
        ...(finding.line === undefined ? {} : { line: finding.line }),
        severity: finding.severity,
        priority,
      })),
    )
    .sort((left, right) => left.code.localeCompare(right.code));
}

function isEvidenceRisk(issue: LintIssue): boolean {
  return issue.code.startsWith("MANIFEST_") || evidenceRiskCodes.has(issue.code);
}

function resolveEvidenceBudget(options: PlanEvidenceBriefOptions): {
  preset: EvidenceBudgetPreset;
  maxChars: number;
  override: boolean;
} {
  const preset = options.budget ?? defaultEvidenceBudgetPreset;
  const presetMaxChars = evidenceBudgetPresets[preset];
  if (presetMaxChars === undefined) {
    throw new EvidenceBudgetError(`Unknown evidence budget preset: ${String(preset)}`, {
      preset,
    });
  }
  const maxChars = options.maxChars ?? presetMaxChars;
  if (!Number.isFinite(maxChars) || maxChars < 1) {
    throw new EvidenceBudgetError("Evidence max characters must be a positive integer.", {
      maxChars,
    });
  }
  return {
    preset,
    maxChars: Math.trunc(maxChars),
    override: options.maxChars !== undefined,
  };
}

function isEvidenceSection(section: ReadSection): boolean {
  return !["citations", "references"].includes(section.heading.toLocaleLowerCase());
}

function sectionMatch(
  question: string,
  section: ReadSection,
  text: string,
): { score: number; reasons: string[] } {
  const phrase = question.trim().toLocaleLowerCase();
  const heading = section.headingPath.join(" ").toLocaleLowerCase();
  const body = text.toLocaleLowerCase();
  const tokens = tokenize(question);
  const headingTokens = tokenize(heading);
  const bodyTokens = tokenize(body);
  const reasons = new Set<string>();
  let score = 0;
  if (phrase.length > 0 && heading.includes(phrase)) {
    score += 20;
    reasons.add(`section heading match: ${section.heading}`);
  }
  if (phrase.length > 0 && body.includes(phrase)) {
    score += 10;
    reasons.add(`section body match: ${section.heading}`);
  }
  for (const token of tokens) {
    if (headingTokens.has(token)) {
      score += 3;
      reasons.add(`section heading match: ${section.heading}`);
    }
    if (bodyTokens.has(token)) {
      score += 1;
      reasons.add(`section body match: ${section.heading}`);
    }
  }
  return { score, reasons: [...reasons] };
}

function tokenize(input: string): Set<string> {
  return new Set(
    input
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}
