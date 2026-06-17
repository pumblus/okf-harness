export function resolveLocalBinPath(
  installDir: string,
  binName: string,
  runtimePlatform?: NodeJS.Platform | string,
): string;

export function shouldRunWithShell(
  command: string,
  runtimePlatform?: NodeJS.Platform | string,
): boolean;
