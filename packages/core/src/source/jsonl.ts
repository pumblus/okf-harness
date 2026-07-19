import { readFile } from "node:fs/promises";

export const SOURCE_ID_PATTERN = /^src_\d{8}_\d{4}$/;

export type JsonlRow =
  | { ok: true; line: number; value: unknown }
  | { ok: false; line: number; message: string };

export function isSourceId(value: string): boolean {
  return SOURCE_ID_PATTERN.test(value);
}

export async function readJsonlRows(absolutePath: string): Promise<JsonlRow[]> {
  let source = "";
  try {
    source = await readFile(absolutePath, "utf8");
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  }

  const rows: JsonlRow[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }

    try {
      rows.push({ ok: true, line: index + 1, value: JSON.parse(line) });
    } catch (error) {
      rows.push({
        ok: false,
        line: index + 1,
        message: error instanceof Error ? error.message : "Invalid JSON row.",
      });
    }
  });

  return rows;
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
