import { execFile } from "node:child_process";

export const GRAPH_OPEN_FAILED = "GRAPH_OPEN_FAILED" as const;

export type GraphOpenRunner = (executable: string, args: string[]) => Promise<void>;

export type OpenGraphReportOptions = {
  runtimePlatform?: NodeJS.Platform | string | undefined;
  runExecutable?: GraphOpenRunner | undefined;
};

export class GraphOpenError extends Error {
  readonly code = GRAPH_OPEN_FAILED;

  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GraphOpenError";
  }
}

export async function openGraphReport(
  htmlPath: string,
  options: OpenGraphReportOptions = {},
): Promise<void> {
  const runtimePlatform = options.runtimePlatform ?? process.platform;
  const runExecutable = options.runExecutable ?? runExecutableDefault;
  const command = graphOpenCommand(runtimePlatform, htmlPath);
  if (command === null) {
    throw new GraphOpenError(
      `Node platform ${runtimePlatform} cannot automatically open graph reports.`,
      { nodePlatform: runtimePlatform, htmlPath },
    );
  }

  try {
    await runExecutable(command.executable, command.args);
  } catch (error) {
    throw new GraphOpenError(
      `Graph report was generated, but OKF Harness could not open it automatically: ${htmlPath}`,
      {
        nodePlatform: runtimePlatform,
        htmlPath,
        executable: command.executable,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

function graphOpenCommand(
  runtimePlatform: NodeJS.Platform | string,
  htmlPath: string,
): { executable: string; args: string[] } | null {
  switch (runtimePlatform) {
    case "darwin":
      return { executable: "open", args: [htmlPath] };
    case "win32":
      return { executable: "cmd.exe", args: ["/d", "/s", "/c", "start", "", htmlPath] };
    case "linux":
      return { executable: "xdg-open", args: [htmlPath] };
    default:
      return null;
  }
}

async function runExecutableDefault(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(executable, args, { windowsHide: true }, (error) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
