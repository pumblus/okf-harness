import path from "node:path";
import { conceptIdFromPath } from "./concepts.js";

export type MarkdownLink = {
  text: string;
  target: string;
  title?: string;
  raw: string;
  line: number;
};

export function parseMarkdownLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = markdown.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g)) {
      const raw = match[0];
      const text = match[1];
      const target = match[2];
      if (raw === undefined || text === undefined || target === undefined) {
        continue;
      }

      const link: MarkdownLink = {
        text,
        target,
        raw,
        line: index + 1,
      };
      const title = match[3];
      if (title !== undefined) {
        link.title = title;
      }
      links.push(link);
    }
  });

  return links;
}

export function resolveOkfLinkTarget(target: string, fromBundlePath: string): string | undefined {
  if (target.startsWith("http://") || target.startsWith("https://") || target.startsWith("#")) {
    return undefined;
  }

  const withoutFragment = target.split("#", 1)[0] ?? "";
  if (withoutFragment.length === 0 || !withoutFragment.endsWith(".md")) {
    return undefined;
  }

  if (withoutFragment.startsWith("/")) {
    return conceptIdFromPath(withoutFragment.slice(1));
  }
  if (withoutFragment.startsWith("wiki/")) {
    return conceptIdFromPath(withoutFragment);
  }

  const normalized = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromBundlePath), withoutFragment),
  );
  if (normalized.startsWith("../")) {
    return undefined;
  }

  return conceptIdFromPath(normalized);
}
