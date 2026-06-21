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
  evidence: EvidenceItem[];
  candidates: EvidenceCandidate[];
  limits: EvidenceLimit[];
  guidance: string[];
  warnings: SearchWorkspaceResult["warnings"];
};

export type PlanEvidenceBriefOptions = {
  workspaceRoot: string;
  question: string;
};

const maxEvidenceItems = 3;
const maxEvidenceExcerptChars = 4_000;
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
  const evidence = await Promise.all(
    search.results
      .slice(0, maxEvidenceItems)
      .map((result, index) =>
        evidenceItemForResult(workspaceRoot, options.question, result, index),
      ),
  );

  return {
    workspaceRoot,
    question: options.question,
    evidence,
    candidates,
    limits:
      search.totalMatches === 0
        ? [
            {
              code: "NO_MATCHES",
              message: "No synthesized wiki concept documents matched the question.",
            },
          ]
        : [],
    guidance:
      search.totalMatches === 0
        ? [
            "Treat this as a successful no-match result, not a command failure.",
            "Disclose that the synthesized wiki has no evidence for the question unless the user asks to broaden the search.",
          ]
        : [
            "Use selected evidence excerpts as the bounded answer context.",
            "Use thin candidates only for bounded follow-up reads; do not treat unselected candidates as evidence.",
          ],
    warnings: search.warnings,
  };
}

async function evidenceItemForResult(
  workspaceRoot: string,
  question: string,
  result: SearchResultCard,
  index: number,
): Promise<EvidenceItem> {
  const document = await readWorkspaceDocument({ workspaceRoot, target: result.conceptId });
  const selected = await selectEvidenceExcerpt(workspaceRoot, question, result.conceptId, document);
  const item: EvidenceItem = {
    item: index + 1,
    conceptId: result.conceptId,
    path: result.path,
    title: result.title,
    type: result.type,
    range: rangeFromContent(selected.read.content),
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
        limit: maxEvidenceExcerptChars,
      }),
      matchReasons: ["bounded range fallback"],
    };
  }

  const sectionReads = await Promise.all(
    sections.map(async (section) => ({
      section,
      read: await readWorkspaceDocument({ workspaceRoot, target, sectionId: section.sectionId }),
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
        limit: maxEvidenceExcerptChars,
      }),
      matchReasons: ["bounded range fallback"],
    };
  }

  if (best.read.content.returnedChars <= maxEvidenceExcerptChars) {
    return { read: best.read, section: best.section, matchReasons: best.match.reasons };
  }
  return {
    read: await readWorkspaceDocument({
      workspaceRoot,
      target,
      offset: best.section.startOffset,
      limit: maxEvidenceExcerptChars,
    }),
    section: best.section,
    matchReasons: [...best.match.reasons, "bounded range fallback"],
  };
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
