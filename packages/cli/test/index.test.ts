import { describe, expect, it } from "vitest";
import { packageInfo } from "../src/index.js";

describe("@okf-harness/cli", () => {
  it("exposes scaffold package metadata without CLI behavior", () => {
    expect(packageInfo).toEqual({
      name: "@okf-harness/cli",
      role: "cli",
      phase: 0,
    });
  });
});
