import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildNativeHostSmokeEnv,
  resolveLocalBinPath,
  shouldRunWithShell,
} from "../../../scripts/smoke-npm-tarballs.mjs";

describe("npm tarball smoke helpers", () => {
  it("uses Windows command shims for local package bins", () => {
    const installDir = path.win32.join("C:\\Users\\Eric", "OKF Harness", "install");
    const okfhShim = path.win32.join(installDir, "node_modules", ".bin", "okfh.cmd");

    expect(resolveLocalBinPath(installDir, "okfh", "win32")).toBe(okfhShim);
    expect(shouldRunWithShell("pnpm", "win32")).toBe(true);
    expect(shouldRunWithShell("npm", "win32")).toBe(true);
    expect(shouldRunWithShell(okfhShim, "win32")).toBe(true);
    expect(shouldRunWithShell("pnpm", "darwin")).toBe(false);
  });

  it("isolates native host smoke config paths", () => {
    const env = buildNativeHostSmokeEnv(
      {
        PATH: "/usr/bin",
        OPENCODE_CONFIG_DIR: "/real/opencode",
        XDG_CONFIG_HOME: "/real/xdg",
        NPM_CONFIG_USERCONFIG: "/real/npmrc",
        HTTPS_PROXY: "http://proxy.example",
      },
      {
        home: "/tmp/home",
        xdgCacheHome: "/tmp/cache",
        xdgConfigHome: "/tmp/config",
        xdgDataHome: "/tmp/data",
        opencodeConfigDir: "/tmp/opencode",
      },
    );

    expect(env).toMatchObject({
      HOME: "/tmp/home",
      USERPROFILE: "/tmp/home",
      XDG_CACHE_HOME: "/tmp/cache",
      XDG_CONFIG_HOME: "/tmp/config",
      XDG_DATA_HOME: "/tmp/data",
      OPENCODE_CONFIG_DIR: "/tmp/opencode",
      PATH: "/usr/bin",
      HTTPS_PROXY: "http://proxy.example",
    });
    expect(env.NPM_CONFIG_USERCONFIG).toBeUndefined();
  });
});
