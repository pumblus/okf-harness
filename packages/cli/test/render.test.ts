import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { humanCheck, registerWorkspaceCommands } from "../src/commands/workspace.js";
import { writeResult } from "../src/render/result.js";
import type { CliIo, JsonEnvelope } from "../src/types.js";

function render(envelope: JsonEnvelope): string {
  return humanCheck(envelope);
}

const baseCheckData = {
  status: "ready",
  okfVersion: "0.1",
  okfConformance: { ok: true, findings: [] },
  harnessLint: { ok: true, findings: { high: [], medium: [], low: [] } },
};

function checkEnvelope(data: Record<string, unknown>): JsonEnvelope {
  return {
    ok: true,
    command: "check",
    data: { ...baseCheckData, ...data },
    warnings: [],
    next: [],
  };
}

describe("check command human rendering", () => {
  it("reports a sealed workspace as sealed", () => {
    const stdout = render(
      checkEnvelope({
        currency: { sealed: true, promotedSources: 1, dangling: [], diagnostics: [] },
      }),
    );
    expect(stdout).toContain("Currency: sealed");
  });

  it("reports a workspace with nothing to reconcile without claiming a seal", () => {
    const stdout = render(
      checkEnvelope({
        currency: { sealed: true, promotedSources: 0, dangling: [], diagnostics: [] },
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
      }),
    );
    expect(stdout).toContain("Currency: not sealed (MANIFEST_INVALID)");
  });

  it("reports a missing currency verdict as a gap, never as an implied pass", () => {
    const stdout = render(checkEnvelope({}));
    expect(stdout).toContain("Currency: no currency verdict");
    expect(stdout).not.toContain("Currency: sealed");
  });
});

describe("writeResult dispatch", () => {
  function writeThrough(envelope: JsonEnvelope): string {
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

  it("routes registered commands through their renderer", () => {
    registerWorkspaceCommands(
      new Command(),
      {
        writeOut: () => {},
        writeErr: () => {},
      },
      () => {},
    );
    expect(writeThrough(checkEnvelope({}))).toContain("Currency: no currency verdict");
  });

  it("falls back to OK <command> for unregistered commands", () => {
    expect(writeThrough({ ok: true, command: "fake", data: {}, warnings: [], next: [] })).toBe(
      "OK fake\n",
    );
  });

  it("falls back to FAILED <command> for unregistered failed commands", () => {
    expect(writeThrough({ ok: false, command: "fake", data: {}, warnings: [], next: [] })).toBe(
      "FAILED fake\n",
    );
  });
});
