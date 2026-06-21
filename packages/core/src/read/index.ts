import { readFile } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { loadWorkspaceConfig } from "../config/index.js";
import { type OkfMarkdownFile, scanConcepts } from "../okf/concepts.js";
import { type OkfDocumentView, okfDocumentView } from "../okf/document.js";
import { parseMarkdownLinks, resolveOkfLinkTarget } from "../okf/links.js";
import { readSourceManifest, type SourceManifestEntry } from "../source/index.js";

export const INVALID_TARGET = "INVALID_TARGET" as const;
export const TARGET_NOT_FOUND = "TARGET_NOT_FOUND" as const;
export const AMBIGUOUS_SECTION = "AMBIGUOUS_SECTION" as const;
export const READ_LIMIT_EXCEEDED = "READ_LIMIT_EXCEEDED" as const;
export const NON_MARKDOWN_TARGET = "NON_MARKDOWN_TARGET" as const;
export const NON_UTF8_TARGET = "NON_UTF8_TARGET" as const;

export type ReadWorkspaceErrorCode =
  | typeof INVALID_TARGET
  | typeof TARGET_NOT_FOUND
  | typeof AMBIGUOUS_SECTION
  | typeof READ_LIMIT_EXCEEDED
  | typeof NON_MARKDOWN_TARGET
  | typeof NON_UTF8_TARGET;

export class ReadWorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: ReadWorkspaceErrorCode,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ReadWorkspaceError";
  }
}

export type ReadWorkspaceOptions = {
  workspaceRoot: string;
  target: string;
  section?: string | undefined;
  sectionId?: string | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
  full?: boolean | undefined;
};

export type ReadTarget = {
  input: string;
  conceptId: string;
  path: string;
  bundlePath: string;
  reserved: boolean;
};

export type ReadFrontmatter =
  | {
      ok: true;
      data: Record<string, unknown>;
    }
  | {
      ok: false;
      error: "missing" | "invalid";
      message: string;
    };

export type ReadMetadata = {
  title: string;
  type: string;
  tags: string[];
  description?: string;
  timestamp?: string;
};

export type ReadSection = {
  sectionId: string;
  headingPath: string[];
  heading: string;
  level: number;
  startOffset: number;
  endOffset: number;
};

export type ReadLink = {
  text: string;
  target: string;
  conceptId?: string;
  exists: boolean;
  line: number;
};

export type ReadCitation =
  | {
      kind: "reference";
      target: string;
      conceptId?: string;
      exists: boolean;
      line: number;
    }
  | {
      kind: "source";
      sourceId: string;
      exists: boolean;
      source?: SourceManifestEntry;
      line: number;
    };

export type CitationIssue = {
  code: string;
  message: string;
  line?: number;
};

export type ReadContent = {
  mode: "preview" | "section" | "range" | "full";
  text: string;
  startOffset: number;
  endOffset: number;
  contentLength: number;
  returnedChars: number;
  truncated: boolean;
};

export type ReadWorkspaceResult = {
  workspaceRoot: string;
  target: ReadTarget;
  frontmatter: ReadFrontmatter;
  metadata: ReadMetadata;
  outline: ReadSection[];
  availableSections: ReadSection[];
  links: ReadLink[];
  citations: ReadCitation[];
  citationIssues: CitationIssue[];
  content: ReadContent;
  source?: SourceManifestEntry;
  indexLinks?: Array<{ title: string; target: string; conceptId?: string; exists: boolean }>;
  logEntries?: Array<{ date: string; line: number; text: string }>;
  warnings: Array<{ code: string; message: string; path?: string }>;
};

const defaultReadPreviewChars = 12_000;
const maxFullReadChars = 100_000;

export async function readWorkspaceDocument(
  options: ReadWorkspaceOptions,
): Promise<ReadWorkspaceResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const [scanResult, sourceManifest] = await Promise.all([
    scanConcepts(workspaceRoot, config),
    readSourceManifest(workspaceRoot, config),
  ]);
  const file = resolveReadTarget(scanResult.files, options.target);
  await assertUtf8Target(file);
  const sourceEntries = new Map(sourceManifest.entries.map((entry) => [entry.id, entry]));
  const conceptIds = new Set(
    scanResult.files.filter((item) => !item.isReserved).map((item) => item.conceptId),
  );
  const document = okfDocumentView(file);
  const body = document.body;
  const sections = parseSections(body);
  const citationRange = findCitationsRange(sections, body);
  const links = parseBodyLinks(file, body, conceptIds, citationRange);
  const { citations, citationIssues } = parseCitations(
    file,
    body,
    conceptIds,
    sourceEntries,
    citationRange,
  );
  const source =
    file.frontmatter.ok && isReferenceDocument(file)
      ? sourceFromFrontmatter(file.frontmatter.data, sourceEntries)
      : undefined;
  const result: ReadWorkspaceResult = {
    workspaceRoot,
    target: {
      input: options.target,
      conceptId: file.conceptId,
      path: file.workspacePath,
      bundlePath: file.bundlePath,
      reserved: file.isReserved,
    },
    frontmatter: renderFrontmatter(file),
    metadata: renderMetadata(document),
    outline: sections,
    availableSections: sections,
    links,
    citations,
    citationIssues,
    content: selectContent(body, sections, options),
    warnings: file.frontmatter.ok
      ? []
      : [
          {
            code: "FRONTMATTER_DEGRADED",
            path: file.workspacePath,
            message: file.frontmatter.message,
          },
        ],
  };

  if (source !== undefined) {
    result.source = source;
  }
  if (file.bundlePath === "index.md") {
    result.indexLinks = parseIndexLinks(file, body, conceptIds);
  }
  if (path.posix.basename(file.bundlePath) === "log.md") {
    result.logEntries = parseLogEntries(body);
  }
  return result;
}

async function assertUtf8Target(file: OkfMarkdownFile): Promise<void> {
  if (
    file.markdown.includes("\uFFFD") ||
    (file.frontmatter.ok && file.frontmatter.body.includes("\uFFFD"))
  ) {
    throw new ReadWorkspaceError("Read target is not valid UTF-8 markdown.", NON_UTF8_TARGET, {
      path: file.workspacePath,
    });
  }

  const bytes = await readFile(file.absolutePath);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ReadWorkspaceError("Read target is not valid UTF-8 markdown.", NON_UTF8_TARGET, {
      path: file.workspacePath,
    });
  }
}

function resolveReadTarget(files: OkfMarkdownFile[], targetInput: string): OkfMarkdownFile {
  const target = targetInput.trim();
  if (target.length === 0 || target.includes("\\")) {
    throw new ReadWorkspaceError("Read target must be a non-empty OKF path.", INVALID_TARGET);
  }
  if (/\.[^./]+$/.test(target) && !target.endsWith(".md")) {
    throw new ReadWorkspaceError("Read target must be a markdown document.", NON_MARKDOWN_TARGET, {
      target,
    });
  }

  const candidates = targetAliases(target);
  const file = files.find((candidate) =>
    candidates.some(
      (alias) =>
        candidate.conceptId === alias ||
        candidate.workspacePath === alias ||
        candidate.bundlePath === alias ||
        `/${candidate.bundlePath}` === alias,
    ),
  );

  if (file === undefined) {
    throw new ReadWorkspaceError(
      "No OKF concept document matched the read target.",
      TARGET_NOT_FOUND,
      {
        target,
      },
    );
  }
  return file;
}

function targetAliases(target: string): string[] {
  if (target === "index" || target === "wiki/index.md") {
    return ["index", "wiki/index.md", "index.md", "/index.md"];
  }
  if (target === "log" || target === "wiki/log.md") {
    return ["log", "wiki/log.md", "log.md", "/log.md"];
  }

  const withoutWiki = target.startsWith("wiki/") ? target.slice("wiki/".length) : target;
  const withoutSlash = withoutWiki.startsWith("/") ? withoutWiki.slice(1) : withoutWiki;
  const withExtension = withoutSlash.endsWith(".md") ? withoutSlash : `${withoutSlash}.md`;
  const conceptId = withExtension.slice(0, -".md".length);
  return [
    target,
    withoutSlash,
    withExtension,
    conceptId,
    `wiki/${withExtension}`,
    `/${withExtension}`,
  ];
}

function selectContent(
  body: string,
  sections: ReadSection[],
  options: ReadWorkspaceOptions,
): ReadContent {
  const contentLength = body.length;
  if (options.full === true) {
    if (contentLength > maxFullReadChars) {
      throw new ReadWorkspaceError(
        "Full read exceeds the current hard cap. Use section or range reads.",
        READ_LIMIT_EXCEEDED,
        { contentLength, maxFullReadChars },
      );
    }
    return contentForRange(body, 0, body.length, "full");
  }

  if (options.sectionId !== undefined || options.section !== undefined) {
    const section = resolveSection(sections, options);
    return contentForRange(body, section.startOffset, section.endOffset, "section");
  }

  if (options.offset !== undefined || options.limit !== undefined) {
    const startOffset = Math.max(0, Math.trunc(options.offset ?? 0));
    const length = Math.max(0, Math.trunc(options.limit ?? defaultReadPreviewChars));
    return contentForRange(body, startOffset, Math.min(body.length, startOffset + length), "range");
  }

  return contentForRange(body, 0, Math.min(body.length, defaultReadPreviewChars), "preview");
}

function resolveSection(sections: ReadSection[], options: ReadWorkspaceOptions): ReadSection {
  if (options.sectionId !== undefined) {
    const section = sections.find((candidate) => candidate.sectionId === options.sectionId);
    if (section === undefined) {
      throw new ReadWorkspaceError(
        "No section matched the requested section id.",
        TARGET_NOT_FOUND,
        {
          sectionId: options.sectionId,
        },
      );
    }
    return section;
  }

  const matches = sections.filter(
    (section) => section.heading.toLocaleLowerCase() === options.section?.toLocaleLowerCase(),
  );
  if (matches.length === 1) {
    return matches[0] as ReadSection;
  }
  if (matches.length > 1) {
    throw new ReadWorkspaceError(
      "Multiple sections matched the requested heading.",
      AMBIGUOUS_SECTION,
      {
        section: options.section,
        candidates: matches.map((section) => ({
          sectionId: section.sectionId,
          headingPath: section.headingPath,
        })),
      },
    );
  }
  throw new ReadWorkspaceError("No section matched the requested heading.", TARGET_NOT_FOUND, {
    section: options.section,
  });
}

function contentForRange(
  body: string,
  startOffset: number,
  endOffset: number,
  mode: ReadContent["mode"],
): ReadContent {
  const text = body.slice(startOffset, endOffset);
  return {
    mode,
    text,
    startOffset,
    endOffset,
    contentLength: body.length,
    returnedChars: text.length,
    truncated: endOffset < body.length,
  };
}

function parseSections(body: string): ReadSection[] {
  const headings: ReadSection[] = [];
  const slugCounts = new Map<string, number>();
  const stack: Array<{ level: number; heading: string }> = [];
  const headingPattern = /^(#{1,6})\s+(.+?)\s*$/gm;
  let match = headingPattern.exec(body);
  while (match !== null) {
    const marker = match[1];
    const heading = match[2];
    if (marker === undefined || heading === undefined) {
      continue;
    }
    const level = marker.length;
    while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= level) {
      stack.pop();
    }
    stack.push({ level, heading });
    const baseSlug = slugify(stack.map((item) => item.heading).join(" "));
    const count = slugCounts.get(baseSlug) ?? 0;
    slugCounts.set(baseSlug, count + 1);
    const sectionId = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
    headings.push({
      sectionId,
      headingPath: stack.map((item) => item.heading),
      heading,
      level,
      startOffset: match.index,
      endOffset: body.length,
    });
    match = headingPattern.exec(body);
  }

  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    return {
      sectionId: heading.sectionId,
      headingPath: heading.headingPath,
      heading: heading.heading,
      level: heading.level,
      startOffset: heading.startOffset,
      endOffset: next?.startOffset ?? body.length,
    };
  });
}

function parseBodyLinks(
  file: OkfMarkdownFile,
  body: string,
  conceptIds: Set<string>,
  citationRange: OffsetRange | undefined,
): ReadLink[] {
  return parseMarkdownLinks(body)
    .filter((link) => !isLineInRange(link.line, citationRange))
    .flatMap((link) => {
      const conceptId = resolveOkfLinkTarget(link.target, file.bundlePath);
      if (conceptId === undefined) {
        return [];
      }
      const readLink: ReadLink = {
        text: link.text,
        target: link.target,
        conceptId,
        exists: conceptIds.has(conceptId),
        line: link.line,
      };
      return [readLink];
    });
}

function parseCitations(
  file: OkfMarkdownFile,
  body: string,
  conceptIds: Set<string>,
  sourceEntries: Map<string, SourceManifestEntry>,
  citationRange: OffsetRange | undefined,
): { citations: ReadCitation[]; citationIssues: CitationIssue[] } {
  if (citationRange === undefined) {
    return { citations: [], citationIssues: [] };
  }

  const citationMarkdown = body.slice(citationRange.startOffset, citationRange.endOffset);
  const links = parseMarkdownLinks(citationMarkdown);
  const citations: ReadCitation[] = [];
  const citationIssues: CitationIssue[] = [];
  const linkedTargets = new Set<string>();
  for (const link of links) {
    linkedTargets.add(link.target);
    const conceptId = resolveOkfLinkTarget(link.target, file.bundlePath);
    const exists = conceptId !== undefined && conceptIds.has(conceptId);
    const citation: ReadCitation = {
      kind: "reference",
      target: link.target,
      exists,
      line: citationRange.startLine + link.line - 1,
    };
    if (conceptId !== undefined) {
      citation.conceptId = conceptId;
    }
    citations.push(citation);
    if (!exists) {
      citationIssues.push({
        code: "BROKEN_CITATION_REFERENCE",
        line: citation.line,
        message: `Citation reference does not resolve: ${link.target}`,
      });
    }
  }

  const bareReferenceTargets = [
    ...citationMarkdown.matchAll(/(^|\s)(\/?(?:wiki\/)?references\/[^\s)]+\.md)\b/gm),
  ];
  for (const match of bareReferenceTargets) {
    const target = match[2];
    if (target === undefined || linkedTargets.has(target)) {
      continue;
    }
    const conceptId = resolveOkfLinkTarget(target, file.bundlePath);
    const exists = conceptId !== undefined && conceptIds.has(conceptId);
    const citation: ReadCitation = {
      kind: "reference",
      target,
      exists,
      line: citationRange.startLine + lineNumberAtOffset(citationMarkdown, match.index ?? 0) - 1,
    };
    if (conceptId !== undefined) {
      citation.conceptId = conceptId;
    }
    citations.push(citation);
    if (!exists) {
      citationIssues.push({
        code: "BROKEN_CITATION_REFERENCE",
        line: citation.line,
        message: `Citation reference does not resolve: ${target}`,
      });
    }
  }

  const citedSourceIds = [...citationMarkdown.matchAll(/\b(src_\d{8}_\d{4})\b/g)];
  for (const match of citedSourceIds) {
    const sourceId = match[1];
    if (sourceId === undefined) {
      continue;
    }
    const source = sourceEntries.get(sourceId);
    const citation: ReadCitation = {
      kind: "source",
      sourceId,
      exists: source !== undefined,
      line: citationRange.startLine + lineNumberAtOffset(citationMarkdown, match.index ?? 0) - 1,
    };
    if (source !== undefined) {
      citation.source = source;
    }
    citations.push(citation);
    if (source === undefined) {
      citationIssues.push({
        code: "BROKEN_CITATION_SOURCE",
        line: citation.line,
        message: `Citation source id is not registered: ${sourceId}`,
      });
    }
  }

  return { citations, citationIssues };
}

type OffsetRange = {
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
};

function findCitationsRange(sections: ReadSection[], body: string): OffsetRange | undefined {
  const section = sections.find(
    (candidate) =>
      candidate.level === 1 && candidate.heading.trim().toLocaleLowerCase() === "citations",
  );
  if (section === undefined) {
    return undefined;
  }

  return {
    startOffset: section.startOffset,
    endOffset: section.endOffset,
    startLine: lineNumberAtOffset(body, section.startOffset),
    endLine: lineNumberAtOffset(body, section.endOffset),
  };
}

function isLineInRange(line: number, range: OffsetRange | undefined): boolean {
  return range !== undefined && line >= range.startLine && line <= range.endLine;
}

function parseIndexLinks(
  file: OkfMarkdownFile,
  body: string,
  conceptIds: Set<string>,
): Array<{ title: string; target: string; conceptId?: string; exists: boolean }> {
  return parseMarkdownLinks(body).map((link) => {
    const conceptId = resolveOkfLinkTarget(link.target, file.bundlePath);
    const indexLink = {
      title: link.text,
      target: link.target,
      exists: conceptId !== undefined && conceptIds.has(conceptId),
    };
    return conceptId === undefined ? indexLink : { ...indexLink, conceptId };
  });
}

function parseLogEntries(body: string): Array<{ date: string; line: number; text: string }> {
  const lines = body.split(/\r?\n/);
  const entries: Array<{ date: string; line: number; text: string }> = [];
  let currentDate: string | undefined;
  lines.forEach((line, index) => {
    const heading = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      currentDate = heading[1];
      return;
    }
    if (currentDate !== undefined && line.trim().startsWith("- ")) {
      entries.push({ date: currentDate, line: index + 1, text: line.trim().slice(2) });
    }
  });
  return entries;
}

function renderFrontmatter(file: OkfMarkdownFile): ReadFrontmatter {
  if (file.frontmatter.ok) {
    return {
      ok: true,
      data: file.frontmatter.data,
    };
  }
  return {
    ok: false,
    error: file.frontmatter.error,
    message: file.frontmatter.message,
  };
}

function renderMetadata(document: OkfDocumentView): ReadMetadata {
  const metadata: ReadMetadata = {
    title: document.title,
    type: document.frontmatterOk ? (document.type ?? "Reserved") : "Unknown",
    tags: document.tags,
  };
  if (document.description !== undefined) {
    metadata.description = document.description;
  }
  if (document.timestamp !== undefined) {
    metadata.timestamp = document.timestamp;
  }
  return metadata;
}

function sourceFromFrontmatter(
  frontmatter: Record<string, unknown>,
  sourceEntries: Map<string, SourceManifestEntry>,
): SourceManifestEntry | undefined {
  const okfh = frontmatter.okfh;
  if (typeof okfh !== "object" || okfh === null || Array.isArray(okfh)) {
    return undefined;
  }
  const sourceId = (okfh as { source_id?: unknown }).source_id;
  return typeof sourceId === "string" ? sourceEntries.get(sourceId) : undefined;
}

function isReferenceDocument(file: OkfMarkdownFile): boolean {
  return file.workspacePath.startsWith("wiki/references/");
}

function lineNumberAtOffset(input: string, offset: number): number {
  return input.slice(0, offset).split(/\r?\n/).length;
}

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "section";
}
