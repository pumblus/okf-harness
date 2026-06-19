import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLocalBinPath, shouldRunWithShell } from "../../../scripts/smoke-npm-tarballs.mjs";

describe("npm tarball smoke helpers", () => {
  it("uses Windows command shims for local package bins", () => {
    const installDir = path.win32.join("C:\\Users\\Eric", "OKF Harness", "install");
    const okfhShim = path.win32.join(installDir, "node_modules", ".bin", "okfh.cmd");

    expect(resolveLocalBinPath(installDir, "okfh", "win32")).toBe(okfhShim);
    expect(shouldRunWithShell("pnpm", "win32")).toBe(true);
    expect(shouldRunWithShell("npm", "win32")).toBe(true);
    expect(shouldRunWithShell(okfhShim, "win32")).toBe(false);
    expect(shouldRunWithShell("pnpm", "darwin")).toBe(false);
  });
});
