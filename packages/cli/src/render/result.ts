import type { CheckResult } from "@okf-harness/core";
import type { CliIo, JsonEnvelope } from "../types.js";

export function writeResult(io: CliIo, envelope: JsonEnvelope, json = false): void {
  if (json) {
    io.writeOut(`${JSON.stringify(envelope)}\n`);
    return;
  }

  io.writeOut(renderHumanResult(envelope));
}

function renderHumanResult(envelope: JsonEnvelope): string {
  if (envelope.command === "check") {
    const data = envelope.data as Partial<CheckResult>;
    const currencyDetails = [
      ...new Set([
        ...(data.currency?.dangling.map(({ original }) => original) ?? []),
        ...(data.currency?.diagnostics?.map(({ code }) => code) ?? []),
      ]),
    ];
    const rows = [
      `Status: ${humanCheckStatus(data.status)}`,
      `OKF version: ${data.okfVersion ?? "unknown"}`,
      `OKF conformance: ${data.okfConformance?.ok === false ? "fail" : "pass"}`,
      `Harness lint: ${data.harnessLint?.ok === false ? "needs attention" : "pass"}`,
      `Currency: ${
        data.currency?.sealed === false ? `not sealed (${currencyDetails.join(", ")})` : "sealed"
      }`,
    ];
    for (const priority of ["high", "medium", "low"] as const) {
      const findings = data.harnessLint?.findings[priority] ?? [];
      if (findings.length > 0) {
        rows.push(`${priority}: ${findings.length}`);
        rows.push(
          ...findings.map((finding) => {
            const pathValue = finding.path === undefined ? "" : ` ${finding.path}`;
            return `- ${finding.code ?? "ISSUE"}${pathValue}`;
          }),
        );
      }
    }
    const next = envelope.next[0];
    return `${rows.join("\n")}\n${next === undefined ? "" : `Next: ${next}\n`}`;
  }

  if (envelope.command === "status") {
    const next = envelope.next[0];
    return `${envelope.ok ? "OK" : "FAILED"} status\n${next === undefined ? "" : `Next: ${next}\n`}`;
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

  if (envelope.command === "doctor") {
    const data = envelope.data as {
      checks?: Array<{ label?: string; status?: string; message?: string }>;
      summary?: { pass?: number; warn?: number; fail?: number; skip?: number };
    };
    const summary = data.summary ?? {};
    const rows = (data.checks ?? []).map((check) => {
      const label = check.label ?? "Check";
      const status = (check.status ?? "unknown").toUpperCase();
      const message = check.message ?? "";
      return `${status} ${label}: ${message}`;
    });
    return `Doctor: ${summary.pass ?? 0} pass, ${summary.warn ?? 0} warn, ${summary.fail ?? 0} fail, ${summary.skip ?? 0} skip\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
  }

  if (!envelope.ok) {
    return `FAILED ${envelope.command}\n`;
  }

  return `${envelope.ok ? "OK" : "FAILED"} ${envelope.command}\n`;
}

function humanCheckStatus(status: string | undefined): string {
  if (status === "ready") {
    return "Ready";
  }
  if (status === "needs_attention") {
    return "Needs attention";
  }
  if (status === "blocked") {
    return "Blocked";
  }
  return "Unknown";
}
