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
