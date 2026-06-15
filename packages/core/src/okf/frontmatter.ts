import matter from "gray-matter";

export type MarkdownFrontmatter =
  | {
      ok: true;
      hasFrontmatter: true;
      data: Record<string, unknown>;
      body: string;
      raw: string;
    }
  | {
      ok: false;
      hasFrontmatter: false;
      error: "missing";
      message: string;
    }
  | {
      ok: false;
      hasFrontmatter: true;
      error: "invalid";
      message: string;
    };

export function parseMarkdownFrontmatter(markdown: string): MarkdownFrontmatter {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) {
    return {
      ok: false,
      hasFrontmatter: false,
      error: "missing",
      message: "Markdown file is missing YAML frontmatter.",
    };
  }

  try {
    const parsed = matter(markdown);
    return {
      ok: true,
      hasFrontmatter: true,
      data: parsed.data as Record<string, unknown>,
      body: parsed.content,
      raw: parsed.matter,
    };
  } catch (error) {
    return {
      ok: false,
      hasFrontmatter: true,
      error: "invalid",
      message: error instanceof Error ? error.message : "Invalid YAML frontmatter.",
    };
  }
}
