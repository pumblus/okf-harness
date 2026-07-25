import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadWorkspaceConfig, parseWorkspaceConfig } from "../src/config/index.js";
import { validWorkspaceFixture } from "./helpers.js";

describe("workspace config", () => {
  it("parses the fixture config and normalizes the version", async () => {
    const config = await loadWorkspaceConfig(validWorkspaceFixture);

    expect(config.version).toBe("0.1");
    expect(config.workspace).toMatchObject({
      name: "AI Research",
    });
    expect(config.workspace).not.toHaveProperty("platform");
    expect(config.okf.bundle_root).toBe("wiki");
    expect(config.paths.wiki_root).toBe("wiki");
  });

  it("rejects legacy workspace platform fields", async () => {
    const source = await readFile(`${validWorkspaceFixture}/okfh.config.yaml`, "utf8");
    const result = parseWorkspaceConfig(
      source.replace("workspace:\n  name:", "workspace:\n  platform: macos\n  name:"),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "CONFIG_INVALID",
            path: "workspace",
          }),
        ]),
      );
    }
  });

  it("parses a workspace created before runtime pins existed and reports a missing pin", async () => {
    const config = await loadWorkspaceConfig(validWorkspaceFixture);

    expect(config.runtime).toBeUndefined();
  });

  it.each(["0.6.0", "0.6.0-rc.1+build.5"])("reads the exact runtime pin %s", async (pin) => {
    const source = await readFile(`${validWorkspaceFixture}/okfh.config.yaml`, "utf8");
    const result = parseWorkspaceConfig(`${source}runtime:\n  version: ${pin}\n`);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.runtime?.version).toBe(pin);
      expect(result.config.version).toBe("0.1");
    }
  });

  it.each([
    "^0.6.0",
    "latest",
    "0.6",
    "01.2.3",
    "1.2.3-01",
    "1.2.3-..",
    "1.2.3+..",
    "",
  ])("returns CONFIG_INVALID for the non-exact runtime pin %j", async (pin) => {
    const source = await readFile(`${validWorkspaceFixture}/okfh.config.yaml`, "utf8");
    const result = parseWorkspaceConfig(`${source}runtime:\n  version: "${pin}"\n`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "CONFIG_INVALID",
            path: "runtime.version",
          }),
        ]),
      );
    }
  });

  it("returns CONFIG_INVALID for unknown keys in the runtime block", async () => {
    const source = await readFile(`${validWorkspaceFixture}/okfh.config.yaml`, "utf8");
    const result = parseWorkspaceConfig(`${source}runtime:\n  channel: nightly\n`);

    expect(result.ok).toBe(false);
  });

  it("returns CONFIG_INVALID issues for unsafe paths", async () => {
    const source = await readFile(`${validWorkspaceFixture}/okfh.config.yaml`, "utf8");
    const result = parseWorkspaceConfig(source.replace("raw/sources", "../raw/sources"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "CONFIG_INVALID",
            path: "paths.raw_sources",
          }),
        ]),
      );
    }
  });
});
