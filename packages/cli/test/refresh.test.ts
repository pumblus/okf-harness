import { describe, expect, it } from "vitest";
import { createWorkspaceRefreshHint } from "../src/refresh.js";

describe("workspace refresh hints", () => {
  it("omits command lines when the agent executable is absent", () => {
    const hint = createWorkspaceRefreshHint({
      agentClient: "claude",
      workspaceRoot: "/tmp/OKF Harness/研究",
      env: { PATH: "" },
    });

    expect(hint).toMatchObject({
      agentClient: "claude",
      workspacePath: "/tmp/OKF Harness/研究",
      message: expect.stringContaining("Claude Code"),
    });
    expect(hint.message).toContain("claude executable was not found on PATH");
    expect(hint).not.toHaveProperty("commands");
  });

  it("quotes POSIX refresh commands for paths with spaces and non-ASCII text", () => {
    const hint = createWorkspaceRefreshHint({
      agentClient: "codex",
      workspaceRoot: "/tmp/OKF Harness/研究",
      env: { PATH: "/fake/bin" },
      executableOnPath: () => true,
    });

    expect(hint.commands).toEqual(["cd '/tmp/OKF Harness/研究'", "codex"]);
  });

  it("quotes PowerShell refresh commands", () => {
    const hint = createWorkspaceRefreshHint({
      agentClient: "claude",
      workspaceRoot: "C:\\Users\\Eric\\OKF Harness\\研究",
      runtimePlatform: "win32",
      env: { PATH: "C:\\bin", SHELL: "pwsh.exe" },
      executableOnPath: () => true,
    });

    expect(hint.commands).toEqual([
      "Set-Location -LiteralPath 'C:\\Users\\Eric\\OKF Harness\\研究'",
      "claude",
    ]);
  });

  it("quotes Command Prompt refresh commands", () => {
    const hint = createWorkspaceRefreshHint({
      agentClient: "codex",
      workspaceRoot: "C:\\Users\\Eric\\OKF Harness\\研究",
      runtimePlatform: "win32",
      env: { PATH: "C:\\bin", SHELL: "cmd.exe" },
      executableOnPath: () => true,
    });

    expect(hint.commands).toEqual(['cd /d "C:\\Users\\Eric\\OKF Harness\\研究"', "codex"]);
  });

  it("omits command lines when the Windows shell family is unknown", () => {
    const hint = createWorkspaceRefreshHint({
      agentClient: "codex",
      workspaceRoot: "C:\\Users\\Eric\\OKF Harness\\研究",
      runtimePlatform: "win32",
      env: { PATH: "C:\\bin", ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      executableOnPath: () => true,
    });

    expect(hint.message).toContain("Windows shell could not be detected safely");
    expect(hint).not.toHaveProperty("commands");
  });

  it("omits Command Prompt command lines for expansion-sensitive paths", () => {
    const hint = createWorkspaceRefreshHint({
      agentClient: "codex",
      workspaceRoot: "C:\\Users\\Eric\\OKF %USERPROFILE%!\\研究",
      runtimePlatform: "win32",
      env: { PATH: "C:\\bin", SHELL: "cmd.exe" },
      executableOnPath: () => true,
    });

    expect(hint.message).toContain("unsafe for Command Prompt");
    expect(hint).not.toHaveProperty("commands");
  });
});
