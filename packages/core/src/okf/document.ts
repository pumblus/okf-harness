import type { OkfMarkdownFile } from "./concepts.js";

export type OkfDocumentView = {
  title: string;
  type?: string;
  description?: string;
  tags: string[];
  timestamp?: string;
  body: string;
  frontmatterOk: boolean;
};

export function okfDocumentView(file: OkfMarkdownFile): OkfDocumentView {
  const body = file.frontmatter.ok ? file.frontmatter.body : stripFrontmatterFence(file.markdown);
  const view: OkfDocumentView = {
    title: file.frontmatter.ok
      ? (stringValue(file.frontmatter.data.title) ?? firstHeading(file.markdown) ?? file.conceptId)
      : (firstHeading(file.markdown) ?? file.conceptId),
    tags: file.frontmatter.ok ? stringArrayValue(file.frontmatter.data.tags) : [],
    body,
    frontmatterOk: file.frontmatter.ok,
  };

  if (file.frontmatter.ok) {
    const type = stringValue(file.frontmatter.data.type);
    const description = stringValue(file.frontmatter.data.description);
    const timestamp = stringValue(file.frontmatter.data.timestamp);
    if (type !== undefined) {
      view.type = type;
    }
    if (description !== undefined) {
      view.description = description;
    }
    if (timestamp !== undefined) {
      view.timestamp = timestamp;
    }
  }

  return view;
}

function stripFrontmatterFence(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown;
  }
  const end = markdown.indexOf("\n---", 3);
  return end === -1 ? markdown : markdown.slice(end + "\n---".length);
}

function firstHeading(markdown: string): string | undefined {
  return /^#\s+(.+?)\s*$/m.exec(markdown)?.[1];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
