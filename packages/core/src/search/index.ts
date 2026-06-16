import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadWorkspaceConfig } from "../config/index.js";
import { type OkfMarkdownFile, scanConcepts } from "../okf/concepts.js";
import { parseMarkdownLinks, resolveOkfLinkTarget } from "../okf/links.js";

export type SearchFilter = {
  type?: string;
  tag?: string;
  path?: string;
};

export type SearchScoreBreakdown = {
  field: string;
  reason: string;
  score: number;
};

export type SearchResultCard = {
  conceptId: string;
  path: string;
  title: string;
  type: string;
  tags: string[];
  description?: string;
  frontmatterOk: boolean;
  indexMentioned: boolean;
  score: number;
  scoreBreakdown: SearchScoreBreakdown[];
  matchedFields: string[];
  bodyHitCount: number;
};

export type SearchWarning = {
  code: string;
  message: string;
  path?: string;
};

export type SearchWorkspaceOptions = {
  workspaceRoot: string;
  query: string;
  limit?: number | undefined;
};

export type SearchWorkspaceResult = {
  workspaceRoot: string;
  query: string;
  filtersApplied: SearchFilter;
  limit: number;
  totalMatches: number;
  truncated: boolean;
  results: SearchResultCard[];
  warnings: SearchWarning[];
};

const defaultLimit = 10;
const maxLimit = 50;
const maxSearchBodyChars = 200_000;
const stopWords = new Set(["a", "an", "and", "are", "for", "in", "is", "of", "or", "the", "to"]);

export async function searchWorkspace(
  options: SearchWorkspaceOptions,
): Promise<SearchWorkspaceResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const limit = clampLimit(options.limit);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const scanResult = await scanConcepts(workspaceRoot, config);
  const indexMentioned = await readRootIndexMentions(workspaceRoot, config.okf.bundle_root);
  const parsedQuery = parseSearchQuery(options.query);
  const warnings: SearchWarning[] = [];

  const scored = scanResult.files
    .filter((file) => !file.isReserved)
    .map((file) => {
      const card = cardFromMarkdownFile(file, indexMentioned.has(file.conceptId));
      const body = markdownBody(file);
      if (!card.frontmatterOk) {
        warnings.push({
          code: "FRONTMATTER_DEGRADED",
          path: file.workspacePath,
          message: `Search used fallback metadata because frontmatter is invalid: ${file.workspacePath}`,
        });
      }
      if (body.length > maxSearchBodyChars) {
        warnings.push({
          code: "SEARCH_BODY_SKIPPED",
          path: file.workspacePath,
          message: `Search skipped body scoring for a large markdown file: ${file.workspacePath}`,
        });
      }
      return scoreCard(card, body, parsedQuery);
    })
    .filter((candidate) => matchesFilters(candidate.card, parsedQuery.filters))
    .filter((candidate) => candidate.card.score > 0)
    .sort(compareSearchCards)
    .map((candidate) => candidate.card);

  return {
    workspaceRoot,
    query: options.query,
    filtersApplied: parsedQuery.filters,
    limit,
    totalMatches: scored.length,
    truncated: scored.length > limit,
    results: scored.slice(0, limit),
    warnings,
  };
}

function cardFromMarkdownFile(file: OkfMarkdownFile, indexMentioned: boolean): SearchResultCard {
  const title = file.frontmatter.ok
    ? (stringValue(file.frontmatter.data.title) ?? firstHeading(file.markdown) ?? file.conceptId)
    : (firstHeading(file.markdown) ?? file.conceptId);
  const type = file.frontmatter.ok
    ? (stringValue(file.frontmatter.data.type) ?? "Unknown")
    : "Unknown";
  const description = file.frontmatter.ok
    ? stringValue(file.frontmatter.data.description)
    : undefined;

  const card: SearchResultCard = {
    conceptId: file.conceptId,
    path: file.workspacePath,
    title,
    type,
    tags: file.frontmatter.ok ? stringArrayValue(file.frontmatter.data.tags) : [],
    frontmatterOk: file.frontmatter.ok,
    indexMentioned,
    score: 0,
    scoreBreakdown: [],
    matchedFields: [],
    bodyHitCount: 0,
  };
  if (description !== undefined) {
    card.description = description;
  }
  return card;
}

function scoreCard(
  card: SearchResultCard,
  body: string,
  query: ParsedSearchQuery,
): { card: SearchResultCard; exactIdentityMatch: boolean; titlePhraseMatch: boolean } {
  const phrase = query.phrase.toLocaleLowerCase();
  const title = card.title.toLocaleLowerCase();
  const conceptId = card.conceptId.toLocaleLowerCase();
  const pathValue = card.path.toLocaleLowerCase();
  const typeValue = card.type.toLocaleLowerCase();
  const description = (card.description ?? "").toLocaleLowerCase();
  const tags = card.tags.map((tag) => tag.toLocaleLowerCase());
  const matchedFields = new Set<string>();
  const scoreBreakdown: SearchScoreBreakdown[] = [];

  const addScore = (field: string, reason: string, score: number) => {
    if (score <= 0) {
      return;
    }
    matchedFields.add(field);
    scoreBreakdown.push({ field, reason, score });
  };

  const exactIdentityMatch =
    phrase.length > 0 && (title === phrase || conceptId === phrase || pathValue === phrase);
  if (exactIdentityMatch) {
    addScore("identity", "exact title/id/path match", 100);
  }

  const titlePhraseMatch = phrase.length > 0 && title.includes(phrase);
  if (titlePhraseMatch) {
    addScore("title", "title phrase match", 60);
  }
  if (phrase.length > 0 && (conceptId.includes(phrase) || pathValue.includes(phrase))) {
    addScore("path", "id/path phrase match", 50);
  }
  if (phrase.length > 0 && tags.includes(phrase)) {
    addScore("tags", "exact tag match", 40);
  }
  if (query.filters.type !== undefined && typeValue === query.filters.type.toLocaleLowerCase()) {
    addScore("type", "type filter match", 25);
  }
  if (phrase.length > 0 && description.includes(phrase)) {
    addScore("description", "description phrase match", 20);
  }

  addTokenScores("title", query.tokens, tokenize(title), 12, 5, addScore);
  addTokenScores("path", query.tokens, tokenize(`${conceptId} ${pathValue}`), 10, 5, addScore);
  addTokenScores("tags", query.tokens, tokenize(tags.join(" ")), 8, 5, addScore);
  addTokenScores("description", query.tokens, tokenize(description), 4, 5, addScore);

  const bodyForSearch = body.length > maxSearchBodyChars ? "" : body.toLocaleLowerCase();
  const bodyPhraseHits = phrase.length > 0 ? countOccurrences(bodyForSearch, phrase) : 0;
  card.bodyHitCount = Math.min(bodyPhraseHits, 5);
  addScore("body", "body phrase hits", card.bodyHitCount * 4);

  const bodyTokenMatches = [...query.tokens].filter((token) => tokenize(bodyForSearch).has(token));
  addScore("body", "body unique token hits", Math.min(bodyTokenMatches.length, 10) * 2);

  card.score = scoreBreakdown.reduce((total, item) => total + item.score, 0);
  card.scoreBreakdown = scoreBreakdown;
  card.matchedFields = [...matchedFields].sort();
  return { card, exactIdentityMatch, titlePhraseMatch };
}

function addTokenScores(
  field: string,
  queryTokens: Set<string>,
  fieldTokens: Set<string>,
  weight: number,
  cap: number,
  addScore: (field: string, reason: string, score: number) => void,
): void {
  const matches = [...queryTokens].filter((token) => fieldTokens.has(token));
  addScore(field, `${field} token hits`, Math.min(matches.length, cap) * weight);
}

function compareSearchCards(
  left: { card: SearchResultCard; exactIdentityMatch: boolean; titlePhraseMatch: boolean },
  right: { card: SearchResultCard; exactIdentityMatch: boolean; titlePhraseMatch: boolean },
): number {
  return (
    right.card.score - left.card.score ||
    Number(right.exactIdentityMatch) - Number(left.exactIdentityMatch) ||
    Number(right.titlePhraseMatch) - Number(left.titlePhraseMatch) ||
    left.card.conceptId.localeCompare(right.card.conceptId)
  );
}

type ParsedSearchQuery = {
  phrase: string;
  tokens: Set<string>;
  filters: SearchFilter;
};

function parseSearchQuery(query: string): ParsedSearchQuery {
  const filters: SearchFilter = {};
  const terms: string[] = [];

  for (const rawPart of query.split(/\s+/)) {
    const part = rawPart.trim();
    if (part.length === 0) {
      continue;
    }
    const filter = /^(type|tag|path):(.+)$/i.exec(part);
    if (filter?.[1] !== undefined && filter[2] !== undefined) {
      filters[filter[1].toLocaleLowerCase() as keyof SearchFilter] = filter[2];
      continue;
    }
    terms.push(part);
  }

  const phrase = terms.join(" ").trim();
  return {
    phrase,
    tokens: tokenize(phrase),
    filters,
  };
}

function tokenize(input: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of input.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (token.length > 0 && !stopWords.has(token)) {
      tokens.add(token);
    }
  }

  const cjkChars = [...input].filter((char) => /\p{Script=Han}/u.test(char));
  cjkChars.forEach((char) => {
    tokens.add(char);
  });
  for (let index = 0; index < cjkChars.length - 1; index += 1) {
    const first = cjkChars[index];
    const second = cjkChars[index + 1];
    if (first !== undefined && second !== undefined) {
      tokens.add(`${first}${second}`);
    }
  }

  return tokens;
}

function matchesFilters(card: SearchResultCard, filters: SearchFilter): boolean {
  if (
    filters.type !== undefined &&
    card.type.toLocaleLowerCase() !== filters.type.toLocaleLowerCase()
  ) {
    return false;
  }
  if (
    filters.tag !== undefined &&
    !card.tags.some((tag) => tag.toLocaleLowerCase() === filters.tag?.toLocaleLowerCase())
  ) {
    return false;
  }
  if (filters.path !== undefined && !card.path.startsWith(normalizePathFilter(filters.path))) {
    return false;
  }
  return true;
}

function normalizePathFilter(input: string): string {
  return input.startsWith("wiki/") ? input : `wiki/${input.replace(/^\/+/, "")}`;
}

function markdownBody(file: OkfMarkdownFile): string {
  if (file.frontmatter.ok) {
    return file.frontmatter.body;
  }
  return stripFrontmatterFence(file.markdown);
}

function stripFrontmatterFence(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown;
  }
  const end = markdown.indexOf("\n---", 3);
  return end === -1 ? markdown : markdown.slice(end + "\n---".length);
}

function firstHeading(markdown: string): string | undefined {
  const heading = /^#\s+(.+?)\s*$/m.exec(markdown);
  return heading?.[1];
}

async function readRootIndexMentions(
  workspaceRoot: string,
  wikiRoot: string,
): Promise<Set<string>> {
  const indexPath = path.join(workspaceRoot, wikiRoot, "index.md");
  try {
    const indexMarkdown = await readFile(indexPath, "utf8");
    return new Set(
      parseMarkdownLinks(indexMarkdown)
        .map((link) => resolveOkfLinkTarget(link.target, "index.md"))
        .filter((conceptId): conceptId is string => conceptId !== undefined),
    );
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return new Set();
    }
    throw error;
  }
}

function countOccurrences(input: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }

  let count = 0;
  let index = 0;
  while (true) {
    const nextIndex = input.indexOf(needle, index);
    if (nextIndex === -1) {
      return count;
    }
    count += 1;
    index = nextIndex + needle.length;
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return defaultLimit;
  }
  return Math.max(1, Math.min(maxLimit, Math.trunc(limit)));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
