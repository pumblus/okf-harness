import type { CliIo, JsonEnvelope } from "../types.js";

export function writeResult(io: CliIo, envelope: JsonEnvelope, json = false): void {
  if (json) {
    io.writeOut(`${JSON.stringify(envelope)}\n`);
    return;
  }

  io.writeOut(renderHumanResult(envelope));
}

function renderHumanResult(envelope: JsonEnvelope): string {
  if (!envelope.ok) {
    return `FAILED ${envelope.command}\n`;
  }

  if (envelope.command === "search") {
    const data = envelope.data as {
      results?: Array<{ title?: string; path?: string; type?: string; score?: number }>;
      totalMatches?: number;
      truncated?: boolean;
    };
    const rows = (data.results ?? []).map((result, index) => {
      const title = result.title ?? "(untitled)";
      const pathValue = result.path ?? "(unknown path)";
      const type = result.type ?? "Unknown";
      const score = result.score === undefined ? "" : ` score=${result.score}`;
      return `${index + 1}. ${title} [${type}] ${pathValue}${score}`;
    });
    const summary = `Found ${data.totalMatches ?? rows.length}${data.truncated ? " (truncated)" : ""}`;
    return `${summary}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
  }

  if (envelope.command === "read") {
    const data = envelope.data as {
      metadata?: { title?: string; type?: string };
      target?: { path?: string };
      content?: { text?: string; truncated?: boolean };
    };
    const title = data.metadata?.title ?? "(untitled)";
    const type = data.metadata?.type ?? "Unknown";
    const pathValue = data.target?.path ?? "(unknown path)";
    const truncated = data.content?.truncated ? " truncated" : "";
    return `${title} [${type}] ${pathValue}${truncated}\n\n${data.content?.text ?? ""}\n`;
  }

  if (envelope.command === "graph") {
    const data = envelope.data as {
      report?: { htmlPath?: string; backlinksPath?: string };
    };
    return `Graph report: ${data.report?.htmlPath ?? "(not written)"}\nBacklinks: ${data.report?.backlinksPath ?? "(not written)"}\n`;
  }

  return `${envelope.ok ? "OK" : "FAILED"} ${envelope.command}\n`;
}
