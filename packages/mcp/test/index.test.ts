import { describe, expect, it } from "vitest";
import { packageInfo } from "../src/index.js";

describe("@okf-harness/mcp", () => {
  it("exposes scaffold package metadata without MCP tools", () => {
    expect(packageInfo).toEqual({
      name: "@okf-harness/mcp",
      role: "mcp",
    });
  });
});
