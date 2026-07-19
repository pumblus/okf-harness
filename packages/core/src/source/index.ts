import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { access, appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadWorkspaceConfig, type WorkspaceConfig } from "../config/index.js";
import { toPosixPath } from "../paths/index.js";
import { errorCode, isSourceId, readJsonlRows } from "./jsonl.js";
import { safeSlug, titleFromFilename, titleFromUrl } from "./metadata.js";

export const MANIFEST_INVALID = "MANIFEST_INVALID" as const;
export const SOURCE_REGISTRATION_FAILED = "SOURCE_REGISTRATION_FAILED" as const;
export const SOURCE_INPUT_NOT_FOUND = "SOURCE_INPUT_NOT_FOUND" as const;
export const SOURCE_INPUT_UNSUPPORTED = "SOURCE_INPUT_UNSUPPORTED" as const;
export const SOURCE_NOT_REGISTERED = "SOURCE_NOT_REGISTERED" as const;

export type SourceKind = "file" | "url";

export type SourceManifestEntry = {
  id: string;
  kind: SourceKind;
  original: string;
  path: string;
  sha256: string;
  added_at: string;
  mime?: string;
  title?: string;
  reference_concept?: string;
  notes?: string;
};

export type SourceManifestIssue = {
  code: typeof MANIFEST_INVALID;
  message: string;
  path: string;
  line: number;
};

export type SourceManifestReadResult = {
  entries: SourceManifestEntry[];
  issues: SourceManifestIssue[];
};

export type AddSourceOptions = {
  workspaceRoot: string;
  input: string;
  dryRun?: boolean;
  now?: Date;
};

export type SourceAddResult = {
  workspaceRoot: string;
  input: string;
  action: "registered" | "reused" | "planned";
  dryRun: boolean;
  source: SourceManifestEntry;
};

export type ListSourcesOptions = {
  workspaceRoot: string;
};

export type ListSourcesResult = {
  workspaceRoot: string;
  sources: SourceManifestEntry[];
};

export class SourceManagementError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly workspaceRoot?: string,
  ) {
    super(message);
    this.name = "SourceManagementError";
  }
}

export async function addSource(options: AddSourceOptions): Promise<SourceAddResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const manifest = await readSourceManifest(workspaceRoot, config);
  if (manifest.issues.length > 0) {
    throw new SourceManagementError("Source manifest contains invalid rows.", MANIFEST_INVALID);
  }

  const now = options.now ?? new Date();
  const url = parseHttpUrl(options.input);
  if (url !== undefined) {
    return addUrlSource({
      workspaceRoot,
      config,
      input: options.input,
      url,
      now,
      options,
      manifest,
    });
  }
  return addFileSource({ workspaceRoot, config, input: options.input, now, options, manifest });
}

export async function listSources(options: ListSourcesOptions): Promise<ListSourcesResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const manifest = await readSourceManifest(workspaceRoot, config);
  if (manifest.issues.length > 0) {
    throw new SourceManagementError("Source manifest contains invalid rows.", MANIFEST_INVALID);
  }

  return {
    workspaceRoot,
    sources: manifest.entries,
  };
}

export async function readSourceManifest(
  workspaceRootInput: string,
  config?: WorkspaceConfig,
): Promise<SourceManifestReadResult> {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const workspaceConfig = config ?? (await loadWorkspaceConfig(workspaceRoot));
  const manifestPath = path.join(workspaceRoot, workspaceConfig.paths.manifest);
  const entries: SourceManifestEntry[] = [];
  const issues: SourceManifestIssue[] = [];

  for (const row of await readJsonlRows(manifestPath)) {
    if (!row.ok) {
      issues.push({
        code: MANIFEST_INVALID,
        path: workspaceConfig.paths.manifest,
        line: row.line,
        message: row.message,
      });
      continue;
    }

    const entry = parseManifestEntry(row.value, workspaceConfig);
    if (entry.ok) {
      entries.push(entry.entry);
      continue;
    }

    issues.push({
      code: MANIFEST_INVALID,
      path: workspaceConfig.paths.manifest,
      line: row.line,
      message: entry.message,
    });
  }

  return { entries, issues };
}

async function addFileSource(context: {
  workspaceRoot: string;
  config: WorkspaceConfig;
  input: string;
  now: Date;
  options: AddSourceOptions;
  manifest: SourceManifestReadResult;
}): Promise<SourceAddResult> {
  const sourcePath = path.resolve(context.input);
  let sourceStat: Stats;
  try {
    sourceStat = await stat(sourcePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new SourceManagementError(
        `Source file does not exist: ${context.input}`,
        SOURCE_INPUT_NOT_FOUND,
        context.workspaceRoot,
      );
    }
    throw error;
  }

  if (!sourceStat.isFile()) {
    throw new SourceManagementError(
      "Source add supports ordinary files and URLs only.",
      SOURCE_INPUT_UNSUPPORTED,
      context.workspaceRoot,
    );
  }

  const contents = await readFile(sourcePath);
  const sha256 = sha256Hex(contents);
  const existing = context.manifest.entries.find(
    (entry) => entry.kind === "file" && entry.sha256 === sha256,
  );
  if (existing !== undefined) {
    return {
      workspaceRoot: context.workspaceRoot,
      input: context.input,
      action: "reused",
      dryRun: context.options.dryRun === true,
      source: existing,
    };
  }

  const original = path.basename(sourcePath);
  const rawPath = await nextRawSourcePath({
    workspaceRoot: context.workspaceRoot,
    config: context.config,
    now: context.now,
    original,
    extension: path.extname(original),
    entries: context.manifest.entries,
  });
  const entry: SourceManifestEntry = {
    id: nextSourceId(context.manifest.entries, context.now),
    kind: "file",
    original,
    path: rawPath,
    sha256,
    added_at: context.now.toISOString(),
    mime: mimeFromFilename(original),
    title: titleFromFilename(original),
  };

  if (context.options.dryRun === true) {
    return {
      workspaceRoot: context.workspaceRoot,
      input: context.input,
      action: "planned",
      dryRun: true,
      source: entry,
    };
  }

  const absoluteRawPath = path.join(context.workspaceRoot, entry.path);
  await mkdir(path.dirname(absoluteRawPath), { recursive: true });
  await writeFile(absoluteRawPath, contents, { flag: "wx" });
  try {
    await appendManifestEntry(context.workspaceRoot, context.config, entry);
  } catch (error) {
    await rm(absoluteRawPath, { force: true });
    throw new SourceManagementError(
      error instanceof Error ? error.message : "Could not append source manifest entry.",
      SOURCE_REGISTRATION_FAILED,
      context.workspaceRoot,
    );
  }

  return {
    workspaceRoot: context.workspaceRoot,
    input: context.input,
    action: "registered",
    dryRun: false,
    source: entry,
  };
}

async function addUrlSource(context: {
  workspaceRoot: string;
  config: WorkspaceConfig;
  input: string;
  url: URL;
  now: Date;
  options: AddSourceOptions;
  manifest: SourceManifestReadResult;
}): Promise<SourceAddResult> {
  const original = context.url.href;
  const existing = context.manifest.entries.find(
    (entry) => entry.kind === "url" && entry.original === original,
  );
  if (existing !== undefined) {
    return {
      workspaceRoot: context.workspaceRoot,
      input: context.input,
      action: "reused",
      dryRun: context.options.dryRun === true,
      source: existing,
    };
  }

  const metadata = urlMetadataContents(original, context.now);
  const rawPath = await nextRawSourcePath({
    workspaceRoot: context.workspaceRoot,
    config: context.config,
    now: context.now,
    original: urlSlugSource(context.url),
    extension: ".url.md",
    entries: context.manifest.entries,
  });
  const entry: SourceManifestEntry = {
    id: nextSourceId(context.manifest.entries, context.now),
    kind: "url",
    original,
    path: rawPath,
    sha256: sha256Hex(metadata),
    added_at: context.now.toISOString(),
    mime: "text/markdown",
    title: titleFromUrl(context.url),
  };

  if (context.options.dryRun === true) {
    return {
      workspaceRoot: context.workspaceRoot,
      input: context.input,
      action: "planned",
      dryRun: true,
      source: entry,
    };
  }

  const absoluteRawPath = path.join(context.workspaceRoot, entry.path);
  await mkdir(path.dirname(absoluteRawPath), { recursive: true });
  await writeFile(absoluteRawPath, metadata, { flag: "wx" });
  try {
    await appendManifestEntry(context.workspaceRoot, context.config, entry);
  } catch (error) {
    await rm(absoluteRawPath, { force: true });
    throw new SourceManagementError(
      error instanceof Error ? error.message : "Could not append source manifest entry.",
      SOURCE_REGISTRATION_FAILED,
      context.workspaceRoot,
    );
  }

  return {
    workspaceRoot: context.workspaceRoot,
    input: context.input,
    action: "registered",
    dryRun: false,
    source: entry,
  };
}

async function appendManifestEntry(
  workspaceRoot: string,
  config: WorkspaceConfig,
  entry: SourceManifestEntry,
): Promise<void> {
  const manifestPath = path.join(workspaceRoot, config.paths.manifest);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await appendFile(manifestPath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function nextRawSourcePath(options: {
  workspaceRoot: string;
  config: WorkspaceConfig;
  now: Date;
  original: string;
  extension: string;
  entries: SourceManifestEntry[];
}): Promise<string> {
  const dateParts = sourceDateParts(options.now);
  const directory = `${options.config.paths.raw_sources}/${dateParts.year}/${dateParts.month}`;
  const extension = options.extension.length > 0 ? options.extension.toLowerCase() : "";
  const stem =
    extension.length > 0 && options.original.toLowerCase().endsWith(extension)
      ? options.original.slice(0, -extension.length)
      : options.original;
  const slug = safeSlug(stem) || "source";
  const registeredPaths = new Set(options.entries.map((entry) => entry.path));

  for (let suffix = 1; ; suffix += 1) {
    const suffixText = suffix === 1 ? "" : `-${suffix}`;
    const candidate = `${directory}/${slug}${suffixText}${extension}`;
    if (registeredPaths.has(candidate)) {
      continue;
    }
    if (!(await pathExists(path.join(options.workspaceRoot, candidate)))) {
      return candidate;
    }
  }
}

function parseManifestEntry(
  value: unknown,
  config: WorkspaceConfig,
): { ok: true; entry: SourceManifestEntry } | { ok: false; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, message: "Manifest row must be a JSON object." };
  }

  const row = value as Record<string, unknown>;
  const requiredStringFields = ["id", "kind", "original", "path", "sha256", "added_at"];
  for (const field of requiredStringFields) {
    if (typeof row[field] !== "string" || row[field].trim().length === 0) {
      return { ok: false, message: `Manifest row is missing a non-empty ${field} field.` };
    }
  }

  if (row.kind !== "file" && row.kind !== "url") {
    return { ok: false, message: "Manifest kind must be file or url." };
  }
  if (row.status !== undefined && row.status !== "registered") {
    return { ok: false, message: "Manifest status must be registered." };
  }
  if (!isSourceId(String(row.id))) {
    return { ok: false, message: "Manifest source id must match src_YYYYMMDD_NNNN." };
  }
  if (!/^[a-f0-9]{64}$/.test(String(row.sha256))) {
    return { ok: false, message: "Manifest sha256 must be a lowercase hex digest." };
  }
  if (!isSafeRawSourcePath(String(row.path), config)) {
    return { ok: false, message: "Manifest path must be a safe raw source relative path." };
  }

  const entry: SourceManifestEntry = {
    id: String(row.id),
    kind: row.kind,
    original: String(row.original),
    path: toPosixPath(String(row.path)),
    sha256: String(row.sha256),
    added_at: String(row.added_at),
  };
  if (
    typeof row.reference_concept === "string" &&
    row.reference_concept.trim().length > 0 &&
    !isSafeReferenceConceptPath(row.reference_concept, config)
  ) {
    return {
      ok: false,
      message: "Manifest reference_concept must be a safe reference document path.",
    };
  }

  for (const optional of ["mime", "title", "reference_concept", "notes"] as const) {
    if (typeof row[optional] === "string" && row[optional].trim().length > 0) {
      entry[optional] = String(row[optional]);
    }
  }

  return { ok: true, entry };
}

function isSafeRawSourcePath(input: string, config: WorkspaceConfig): boolean {
  const rawPath = toPosixPath(input);
  if (rawPath.startsWith("/") || rawPath.includes("\\") || rawPath.includes("\0")) {
    return false;
  }
  const segments = rawPath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return false;
  }
  return rawPath === config.paths.raw_sources || rawPath.startsWith(`${config.paths.raw_sources}/`);
}

function isSafeReferenceConceptPath(input: string, config: WorkspaceConfig): boolean {
  const referencePath = toPosixPath(input);
  if (
    referencePath.startsWith("/") ||
    referencePath.includes("\\") ||
    referencePath.includes("\0") ||
    !referencePath.endsWith(".md")
  ) {
    return false;
  }
  const segments = referencePath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return false;
  }
  return referencePath.startsWith(`${config.paths.wiki_root}/references/`);
}

function parseHttpUrl(input: string): URL | undefined {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function sourceDateParts(now: Date): { year: string; month: string; date: string } {
  const [date] = now.toISOString().split("T");
  if (date === undefined) {
    throw new Error("Could not derive source date.");
  }
  const [year, month] = date.split("-");
  if (year === undefined || month === undefined) {
    throw new Error("Could not derive source date parts.");
  }
  return { year, month, date: date.replace(/-/g, "") };
}

function nextSourceId(entries: SourceManifestEntry[], now: Date): string {
  const { date } = sourceDateParts(now);
  const maxSequence = entries.reduce((max, entry) => {
    const match = new RegExp(`^src_${date}_(\\d{4})$`).exec(entry.id);
    if (match?.[1] === undefined) {
      return max;
    }
    return Math.max(max, Number(match[1]));
  }, 0);
  return `src_${date}_${String(maxSequence + 1).padStart(4, "0")}`;
}

function urlSlugSource(url: URL): string {
  const pathname = url.pathname.split("/").filter(Boolean).join("-");
  return pathname.length > 0 ? `${url.hostname}-${pathname}` : url.hostname;
}

function urlMetadataContents(url: string, now: Date): string {
  return `# URL Source\n\nURL: ${url}\nRegistered at: ${now.toISOString()}\n`;
}

function sha256Hex(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function mimeFromFilename(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".pdf":
      return "application/pdf";
    case ".html":
    case ".htm":
      return "text/html";
    case ".json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

async function pathExists(input: string): Promise<boolean> {
  try {
    await access(input);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}
