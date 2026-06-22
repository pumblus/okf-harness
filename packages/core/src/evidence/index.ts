import path from "node:path";
import {
  type CitationIssue,
  type ReadCitation,
  type ReadContent,
  type ReadSection,
  readWorkspaceDocument,
} from "../read/index.js";
import type { SearchResultCard } from "../search/index.js";
import { type SearchWorkspaceResult, searchWorkspace } from "../search/index.js";

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
  };
};

export type EvidenceLimit = {
  code: string;
  message: string;
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
  limits: EvidenceLimit[];
  guidance: string[];
  warnings: SearchWorkspaceResult["warnings"];
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

const maxEvidenceItems = 3;
const defaultEvidenceBudgetPreset: EvidenceBudgetPreset = "standard";
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
  const search = await searchWorkspace({
    workspaceRoot,
    query: options.question,
  });
  const candidates = search.results.map((result, index) => ({
    item: index + 1,
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
    search.results.slice(0, maxEvidenceItems),
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
    limits: evidenceLimits(search.totalMatches, truncated),
    guidance:
      search.totalMatches === 0
        ? [
            "Treat this as a successful no-match result, not a command failure.",
            "Disclose that the synthesized wiki has no evidence for the question unless the user asks to broaden the search.",
          ]
        : [
            "Use selected evidence excerpts as the bounded answer context.",
            "Use thin candidates only for bounded follow-up reads; do not treat unselected candidates as evidence.",
            ...(truncated
              ? ["Follow continuation cues with bounded okfh read calls only when needed."]
              : []),
          ],
    warnings: search.warnings,
  };
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
    provenance: {
      citations: selected.read.citations,
      citationIssues: selected.read.citationIssues,
    },
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
      command: `okfh read ${shellQuote(target)} --workspace ${shellQuote(workspaceRoot)} --offset ${range.endOffset} --limit ${readLimit} --json`,
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
