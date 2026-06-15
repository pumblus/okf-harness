import { describe, expect, it } from "vitest";
import { packageInfo } from "../src/index.js";

describe("@okf-harness/core", () => {
  it("exposes scaffold package metadata", () => {
    expect(packageInfo).toEqual({
      name: "@okf-harness/core",
      role: "core",
      phase: 0,
    });
  });
});
