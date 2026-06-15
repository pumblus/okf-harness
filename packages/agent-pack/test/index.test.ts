import { describe, expect, it } from "vitest";
import { packageInfo } from "../src/index.js";

describe("@okf-harness/agent-pack", () => {
  it("exposes scaffold package metadata without adapter rendering", () => {
    expect(packageInfo).toEqual({
      name: "@okf-harness/agent-pack",
      role: "agent-pack",
      phase: 0,
    });
  });
});
