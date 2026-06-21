import path from "node:path";

export function safeSlug(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function titleFromFilename(filename: string): string {
  const extension = path.extname(filename);
  const stem = extension.length > 0 ? filename.slice(0, -extension.length) : filename;
  return stem.trim().length > 0 ? stem : filename;
}

export function titleFromUrl(url: URL): string {
  const pathname = url.pathname.split("/").filter(Boolean).at(-1);
  return pathname !== undefined && pathname.length > 0 ? pathname : url.hostname;
}
