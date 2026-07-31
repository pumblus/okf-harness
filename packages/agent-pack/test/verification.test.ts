import { describe, expect, it } from "vitest";
import {
  type NativeIntegrationId,
  type NativeIntegrationProbeResult,
  nativeIntegrationProfile,
  verifyNativeIntegration,
} from "../src/index.js";

const fixtures: Record<
  NativeIntegrationId,
  { verified: string[]; absent: string[]; malformed: string[] }
> = {
  claude: {
    verified: [
      JSON.stringify([
        {
          name: "okf-harness",
          source: "github",
          repo: "pumblus/okf-harness",
          installLocation: "/home/test/.claude/plugins/marketplaces/okf-harness",
        },
      ]),
      JSON.stringify([
        {
          id: "okf-harness@okf-harness",
          version: "0.6.0",
          scope: "user",
          enabled: true,
        },
      ]),
    ],
    absent: ["[]", "[]"],
    malformed: ["not json", "[]"],
  },
  codex: {
    verified: [
      JSON.stringify({
        installed: [
          {
            pluginId: "okf-harness@okf-harness",
            name: "okf-harness",
            marketplaceName: "okf-harness",
            installed: true,
            enabled: true,
            marketplaceSource: {
              sourceType: "git",
              source: "https://github.com/pumblus/okf-harness.git",
            },
          },
        ],
        available: [],
      }),
    ],
    absent: [JSON.stringify({ installed: [], available: [] })],
    malformed: [JSON.stringify({ plugins: [] })],
  },
  opencode: {
    verified: [
      JSON.stringify({
        plugin: ["@pumblus/okf-harness"],
        plugin_origins: [
          {
            spec: "@pumblus/okf-harness",
            source: "/home/test/.config/opencode",
            scope: "global",
          },
        ],
      }),
    ],
    absent: [JSON.stringify({ plugin: [] })],
    malformed: [JSON.stringify({ plugin: "@pumblus/okf-harness" })],
  },
  pi: {
    verified: [
      [
        "User packages:",
        "  npm:@pumblus/okf-harness",
        "    C:\\Users\\test\\.pi\\agent\\npm\\okf\\node_modules\\@pumblus\\okf-harness",
      ].join("\n"),
    ],
    absent: ["No packages installed.\n"],
    malformed: ["Packages may exist somewhere.\n"],
  },
  hermes: {
    verified: [
      JSON.stringify({
        hermes_version: "0.1.0",
        skills: [
          {
            name: "okf-harness",
            source: "github",
            identifier: "pumblus/okf-harness/okf-harness",
          },
        ],
        taps: [{ repo: "pumblus/okf-harness", path: "skills/" }],
      }),
      JSON.stringify([
        {
          name: "okf-harness",
          identifier: "pumblus/okf-harness/okf-harness",
          source: "github",
        },
      ]),
    ],
    absent: [JSON.stringify({ skills: [], taps: [] }), "[]"],
    malformed: [JSON.stringify({ skills: [] }), "[]"],
  },
  openclaw: {
    verified: [
      JSON.stringify({
        name: "okf-harness",
        source: "openclaw-managed",
        disabled: true,
        blockedByAllowlist: true,
        blockedByAgentFilter: true,
        clawhub: {
          status: "linked",
          valid: true,
          ownerHandle: "pumblus",
          slug: "okf-harness",
        },
      }),
    ],
    absent: [JSON.stringify({ error: "not found", skill: "okf-harness" })],
    malformed: [JSON.stringify({ name: "okf-harness", source: "openclaw-managed" })],
  },
};

function successful(stdout: string[]): NativeIntegrationProbeResult[] {
  return stdout.map((value) => ({ stdout: value, exitCode: 0 }));
}

describe("native integration verification", () => {
  it.each(
    Object.keys(fixtures) as NativeIntegrationId[],
  )("verifies the exact %s integration identity", (id) => {
    const profile = nativeIntegrationProfile(id);
    expect(
      verifyNativeIntegration(profile.verification, successful(fixtures[id].verified)),
    ).toEqual({
      outcome: "verified",
      reason: "integration-verified",
      expectedIdentity: profile.verification.expectedIdentity,
    });
  });

  it.each(
    Object.keys(fixtures) as NativeIntegrationId[],
  )("reports an absent %s integration as failed", (id) => {
    const profile = nativeIntegrationProfile(id);
    expect(
      verifyNativeIntegration(profile.verification, successful(fixtures[id].absent)),
    ).toMatchObject({ outcome: "failed", reason: "integration-not-installed" });
  });

  it.each(
    Object.keys(fixtures) as NativeIntegrationId[],
  )("reports malformed %s probe output as unavailable", (id) => {
    const profile = nativeIntegrationProfile(id);
    expect(
      verifyNativeIntegration(profile.verification, successful(fixtures[id].malformed)),
    ).toMatchObject({ outcome: "unavailable", reason: "probe-output-incompatible" });
  });

  it.each(
    Object.keys(fixtures) as NativeIntegrationId[],
  )("reports a %s probe command failure without parsing its output", (id) => {
    const profile = nativeIntegrationProfile(id);
    expect(
      verifyNativeIntegration(profile.verification, [
        { stdout: "secret host output", exitCode: 23 },
      ]),
    ).toEqual({
      outcome: "unavailable",
      reason: "probe-command-failed",
      expectedIdentity: profile.verification.expectedIdentity,
      exitCode: 23,
    });
  });

  it("rejects Claude Code plugin errors", () => {
    const claude = nativeIntegrationProfile("claude");
    const claudeOutput = fixtures.claude.verified.map((value, index) =>
      index === 1
        ? JSON.stringify([
            { id: "okf-harness@okf-harness", enabled: true, errors: ["load failed"] },
          ])
        : value,
    );

    expect(verifyNativeIntegration(claude.verification, successful(claudeOutput))).toMatchObject({
      outcome: "failed",
      reason: "integration-errors-reported",
    });
  });

  it("rejects disabled Claude Code and Codex plugins", () => {
    const claude = nativeIntegrationProfile("claude");
    const claudeOutput = fixtures.claude.verified.map((value, index) =>
      index === 1
        ? JSON.stringify([{ id: "okf-harness@okf-harness", enabled: false, errors: [] }])
        : value,
    );
    expect(verifyNativeIntegration(claude.verification, successful(claudeOutput))).toMatchObject({
      outcome: "failed",
      reason: "integration-disabled",
    });

    const codex = nativeIntegrationProfile("codex");
    const parsed = JSON.parse(fixtures.codex.verified[0] ?? "{}") as {
      installed: Array<Record<string, unknown>>;
    };
    parsed.installed[0] = { ...parsed.installed[0], enabled: false };
    expect(
      verifyNativeIntegration(codex.verification, successful([JSON.stringify(parsed)])),
    ).toMatchObject({ outcome: "failed", reason: "integration-disabled" });
  });

  it("treats incomplete Claude marketplace and error output as unavailable", () => {
    const claude = nativeIntegrationProfile("claude");
    const missingRepo = [
      JSON.stringify([{ name: "okf-harness", source: "github" }]),
      fixtures.claude.verified[1] ?? "[]",
    ];
    expect(verifyNativeIntegration(claude.verification, successful(missingRepo))).toMatchObject({
      outcome: "unavailable",
      reason: "probe-output-incompatible",
    });

    const malformedError = [
      fixtures.claude.verified[0] ?? "[]",
      JSON.stringify([{ id: "okf-harness@okf-harness", enabled: true, error: null }]),
    ];
    expect(verifyNativeIntegration(claude.verification, successful(malformedError))).toMatchObject({
      outcome: "unavailable",
      reason: "probe-output-incompatible",
    });
  });

  it("rejects lookalike Codex marketplace sources", () => {
    const codex = nativeIntegrationProfile("codex");
    const parsed = JSON.parse(fixtures.codex.verified[0] ?? "{}") as {
      installed: Array<{ marketplaceSource: { source: string } }>;
    };
    const plugin = parsed.installed[0];
    if (plugin === undefined) {
      throw new Error("Verified Codex fixture is missing its plugin.");
    }
    plugin.marketplaceSource.source = "https://example.com/mirror/pumblus/okf-harness.git";

    expect(
      verifyNativeIntegration(codex.verification, successful([JSON.stringify(parsed)])),
    ).toMatchObject({ outcome: "failed", reason: "integration-identity-mismatch" });
  });

  it("rejects a non-Git Codex marketplace with a canonical-looking source", () => {
    const codex = nativeIntegrationProfile("codex");
    const parsed = JSON.parse(fixtures.codex.verified[0] ?? "{}") as {
      installed: Array<{
        marketplaceSource: { source: string; sourceType: string };
      }>;
    };
    const plugin = parsed.installed[0];
    if (plugin === undefined) {
      throw new Error("Verified Codex fixture is missing its plugin.");
    }
    plugin.marketplaceSource = { sourceType: "local", source: "pumblus/okf-harness" };

    expect(
      verifyNativeIntegration(codex.verification, successful([JSON.stringify(parsed)])),
    ).toMatchObject({ outcome: "failed", reason: "integration-identity-mismatch" });
  });

  it("requires a global OpenCode plugin origin", () => {
    const opencode = nativeIntegrationProfile("opencode");
    const parsed = JSON.parse(fixtures.opencode.verified[0] ?? "{}") as {
      plugin_origins: Array<Record<string, unknown>>;
    };
    parsed.plugin_origins[0] = { ...parsed.plugin_origins[0], scope: "local" };

    expect(
      verifyNativeIntegration(opencode.verification, successful([JSON.stringify(parsed)])),
    ).toMatchObject({ outcome: "failed", reason: "integration-identity-mismatch" });
  });

  it("accepts the exact Pi user package with POSIX separators and filtered resources", () => {
    const pi = nativeIntegrationProfile("pi");
    const output = [
      "User packages:",
      "  npm:@pumblus/okf-harness (filtered)",
      "    /home/test/.pi/agent/npm/okf/node_modules/@pumblus/okf-harness/",
    ].join("\n");

    expect(verifyNativeIntegration(pi.verification, successful([output]))).toMatchObject({
      outcome: "verified",
    });
  });
});
