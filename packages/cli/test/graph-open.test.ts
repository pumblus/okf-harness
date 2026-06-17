import { describe, expect, it } from "vitest";
import { type GraphOpenError, type GraphOpenRunner, openGraphReport } from "../src/graph-open.js";

describe("@okf-harness/cli graph report opener", () => {
  it("opens Windows graph reports through cmd start with paths kept as arguments", async () => {
    const runs: Array<{ executable: string; args: string[] }> = [];
    const runExecutable: GraphOpenRunner = async (executable, args) => {
      runs.push({ executable, args });
    };

    await openGraphReport("C:\\Users\\Eric\\Documents\\OKF Harness\\graph.html", {
      runtimePlatform: "win32",
      runExecutable,
    });

    expect(runs).toEqual([
      {
        executable: "cmd.exe",
        args: [
          "/d",
          "/s",
          "/c",
          "start",
          "",
          "C:\\Users\\Eric\\Documents\\OKF Harness\\graph.html",
        ],
      },
    ]);
  });

  it("reports Linux opener failures without hiding the generated report path", async () => {
    await expect(
      openGraphReport("/home/eric/OKF Harness/graph.html", {
        runtimePlatform: "linux",
        runExecutable: async () => {
          throw new Error("xdg-open was not found");
        },
      }),
    ).rejects.toMatchObject({
      code: "GRAPH_OPEN_FAILED",
      details: {
        nodePlatform: "linux",
        htmlPath: "/home/eric/OKF Harness/graph.html",
        executable: "xdg-open",
      },
    } satisfies Partial<GraphOpenError>);
  });
});
