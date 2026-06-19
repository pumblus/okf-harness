import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLocalBinPath, shouldRunWithShell } from "../../../scripts/smoke-npm-tarballs.mjs";

type SmokeHelpers = {
  resolveSpawn: (
    command: string,
    args: string[],
    runtimePlatform: NodeJS.Platform,
  ) => { command: string; args: string[]; shell: boolean };
};

describe("npm tarball smoke helpers", () => {
  it("uses Windows command shims for local package bins", async () => {
    const { resolveSpawn } = (await import(
      "../../../scripts/smoke-npm-tarballs.mjs"
    )) as unknown as SmokeHelpers;
    const installDir = path.win32.join("C:\\Users\\Eric", "OKF Harness", "install");
    const okfhShim = path.win32.join(installDir, "node_modules", ".bin", "okfh.cmd");

    expect(resolveLocalBinPath(installDir, "okfh", "win32")).toBe(okfhShim);
    expect(shouldRunWithShell("pnpm", "win32")).toBe(true);
    expect(shouldRunWithShell("npm", "win32")).toBe(true);
    expect(shouldRunWithShell(okfhShim, "win32")).toBe(false);
    expect(resolveSpawn(okfhShim, ["doctor", "--json"], "win32")).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `"${okfhShim}" "doctor" "--json"`],
      shell: false,
    });
    expect(shouldRunWithShell("pnpm", "darwin")).toBe(false);
  });
});
