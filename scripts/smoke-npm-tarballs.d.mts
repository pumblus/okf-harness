export function resolveLocalBinPath(
  installDir: string,
  binName: string,
  runtimePlatform?: NodeJS.Platform | string,
): string;

export function shouldRunWithShell(
  command: string,
  runtimePlatform?: NodeJS.Platform | string,
): boolean;

export function buildNativeHostSmokeEnv(
  baseEnv: NodeJS.ProcessEnv,
  paths: {
    home: string;
    xdgCacheHome: string;
    xdgConfigHome: string;
    xdgDataHome: string;
    opencodeConfigDir?: string;
  },
): Record<string, string>;
