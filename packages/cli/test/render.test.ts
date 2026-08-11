import { describe, expect, it } from "vitest";
import { writeResult } from "../src/render/result.js";
import type { CliIo, JsonEnvelope } from "../src/types.js";

function render(envelope: JsonEnvelope): string {
  let stdout = "";
  const io: CliIo = {
    writeOut: (chunk) => {
      stdout += chunk;
    },
    writeErr: () => {},
  };
  writeResult(io, envelope, false);
  return stdout;
}

function checkEnvelope(data: Record<string, unknown>): JsonEnvelope {
  return {
    ok: true,
    command: "check",
    data,
    warnings: [],
    next: [],
  };
}

describe("writeResult check rendering", () => {
  it("reports a sealed workspace as sealed", () => {
    const stdout = render(
      checkEnvelope({
        status: "ready",
        okfVersion: "0.1",
        currency: { sealed: true, promotedSources: 1, dangling: [], diagnostics: [] },
        okfConformance: { ok: true, findings: [] },
        harnessLint: { ok: true, findings: { high: [], medium: [], low: [] } },
      }),
    );
    expect(stdout).toContain("Currency: sealed");
  });

  it("reports a workspace with nothing to reconcile without claiming a seal", () => {
    const stdout = render(
      checkEnvelope({
        status: "ready",
        okfVersion: "0.1",
        currency: { sealed: true, promotedSources: 0, dangling: [], diagnostics: [] },
        okfConformance: { ok: true, findings: [] },
        harnessLint: { ok: true, findings: { high: [], medium: [], low: [] } },
      }),
    );
    expect(stdout).toContain("Currency: no promoted sources to reconcile");
    expect(stdout).not.toContain("Currency: sealed");
  });

  it("reports an unsealed workspace with its reasons", () => {
    const stdout = render(
      checkEnvelope({
        status: "needs_attention",
        okfVersion: "0.1",
        currency: {
          sealed: false,
          promotedSources: 1,
          dangling: [],
          diagnostics: [{ code: "MANIFEST_INVALID", severity: "error", message: "broken" }],
        },
        okfConformance: { ok: true, findings: [] },
        harnessLint: { ok: true, findings: { high: [], medium: [], low: [] } },
      }),
    );
    expect(stdout).toContain("Currency: not sealed (MANIFEST_INVALID)");
  });

  it("reports a missing currency verdict as a gap, never as an implied pass", () => {
    const stdout = render(
      checkEnvelope({
        status: "ready",
        okfVersion: "0.1",
        okfConformance: { ok: true, findings: [] },
        harnessLint: { ok: true, findings: { high: [], medium: [], low: [] } },
      }),
    );
    expect(stdout).toContain("Currency: no currency evidence");
    expect(stdout).not.toContain("Currency: sealed");
  });
});
