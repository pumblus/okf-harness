#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  type BootstrapAgent,
  detectBootstrapAgent,
  installBootstrapAgent,
  supportedBootstrapAgents,
} from "@okf-harness/agent-pack";

type PostinstallIo = {
  writeOut: (chunk: string) => void;
};

type RunPostinstallOptions = {
  env?: NodeJS.ProcessEnv;
  interactive?: boolean;
  io?: PostinstallIo;
};

const promptNames: Record<BootstrapAgent, string> = {
  codex: "$okf-harness-bootstrap",
  claude: "/okf-harness-bootstrap",
};

export async function runPostinstall(options: RunPostinstallOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const io = options.io ?? { writeOut: (chunk) => process.stdout.write(chunk) };
  const interactive = options.interactive ?? process.stdout.isTTY === true;

  if (shouldSkipBootstrap(env, interactive)) {
    io.writeOut("OKF Harness bootstrap skipped. Run okfh doctor --json.\n");
    return;
  }

  const installedPrompts: string[] = [];
  let needsDoctor = false;

  for (const agent of supportedBootstrapAgents) {
    try {
      const detection = await detectBootstrapAgent({ agent, env });
      if (!detection.detected) {
        continue;
      }

      const result = await installBootstrapAgent({ agent, env });
      if (result.conflicts.length === 0 && result.status.state === "installed") {
        installedPrompts.push(promptNames[agent]);
      } else {
        needsDoctor = true;
      }
    } catch {
      needsDoctor = true;
    }
  }

  if (installedPrompts.length > 0 && !needsDoctor) {
    io.writeOut(`OKF Harness bootstrap ready: ${uniqueStrings(installedPrompts).join(", ")}.\n`);
    return;
  }

  io.writeOut("OKF Harness installed. Run okfh doctor --json.\n");
}

function shouldSkipBootstrap(env: NodeJS.ProcessEnv, interactive: boolean): boolean {
  if (isTruthyEnv(env.CI) || isPrivilegedInstall(env)) {
    return true;
  }
  return interactive === false && !isNpmPostinstall(env);
}

function isTruthyEnv(value: string | undefined): boolean {
  return value !== undefined && value !== "" && value !== "0" && value !== "false";
}

function isNpmPostinstall(env: NodeJS.ProcessEnv): boolean {
  return env.npm_lifecycle_event === "postinstall" && env.npm_package_name === "@okf-harness/cli";
}

function isPrivilegedInstall(env: NodeJS.ProcessEnv): boolean {
  return process.getuid?.() === 0 || env.SUDO_UID !== undefined || env.SUDO_USER !== undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  await runPostinstall();
}

function isDirectRun(moduleUrl: string, argvPath: string | undefined): boolean {
  return argvPath !== undefined && moduleUrl === pathToFileURL(argvPath).href;
}
