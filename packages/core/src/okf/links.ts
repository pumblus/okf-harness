import path from "node:path";
import { conceptIdFromPath } from "./concepts.js";

export type MarkdownLink = {
  text: string;
  target: string;
  line: number;
};

export type BareReferenceTarget = {
  target: string;
  line: number;
};

export function parseMarkdownLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = markdown.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g)) {
      const text = match[1];
      const target = match[2];
      if (text === undefined || target === undefined) {
        continue;
      }

      links.push({
        text,
        target,
        line: index + 1,
      });
    }
  });

  return links;
}

export function parseBareReferenceTargets(markdown: string): BareReferenceTarget[] {
  return markdown.split(/\r?\n/).flatMap((line, index) =>
    [...line.matchAll(/(^|\s)(\/?(?:wiki\/)?references\/[^\s)]+\.md)\b/g)]
      .map((match) => match[2])
      .filter((target): target is string => target !== undefined)
      .map((target) => ({ target, line: index + 1 })),
  );
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
