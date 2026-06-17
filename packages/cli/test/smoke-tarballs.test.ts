import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLocalBinPath, shouldRunWithShell } from "../../../scripts/smoke-npm-tarballs.mjs";

describe("npm tarball smoke helpers", () => {
  it("uses Windows command shims for local package bins", () => {
    const installDir = path.join("C:\\Users\\Eric", "OKF Harness", "install");

    expect(resolveLocalBinPath(installDir, "okfh", "win32")).toBe(
      path.join(installDir, "node_modules", ".bin", "okfh.cmd"),
    );
    expect(shouldRunWithShell("pnpm", "win32")).toBe(true);
    expect(shouldRunWithShell("npm", "win32")).toBe(true);
    expect(
      shouldRunWithShell(path.join(installDir, "node_modules", ".bin", "okfh.cmd"), "win32"),
    ).toBe(true);
    expect(shouldRunWithShell("pnpm", "darwin")).toBe(false);
  });
});
