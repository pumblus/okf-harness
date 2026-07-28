export type NativeIntegrationId = "claude" | "codex" | "opencode" | "pi" | "hermes" | "openclaw";

export type NativeInstallCommand = {
  command: string;
  args: string[];
};

export type NativeIntegrationProfile = {
  id: NativeIntegrationId;
  label: string;
  command: string;
  supportLevel: "native-supported";
  defaultSelected: boolean;
  nativeInstall: string;
  nativeInstallCommands: readonly NativeInstallCommand[];
};

export type ShadowingGlobalInstallProfile =
  | {
      id: "runtime";
      label: "Global okfh runtime";
      executable: "okfh";
    }
  | {
      id: "bootstrap";
      label: "Global bootstrap package";
      packageName: "@pumblus/okf-harness";
    };

export const shadowingGlobalInstallProfiles = [
  { id: "runtime", label: "Global okfh runtime", executable: "okfh" },
  {
    id: "bootstrap",
    label: "Global bootstrap package",
    packageName: "@pumblus/okf-harness",
  },
] as const satisfies readonly ShadowingGlobalInstallProfile[];

export const shadowingGlobalInstallCleanupCommand: NativeInstallCommand = {
  command: "npm",
  args: ["uninstall", "-g", "@okf-harness/cli", "@pumblus/okf-harness"],
};

export type DetectedShadowingGlobalInstall =
  | {
      id: "runtime";
      label: "Global okfh runtime";
      executablePath: string;
    }
  | {
      id: "bootstrap";
      label: "Global bootstrap package";
      packageName: "@pumblus/okf-harness";
      version: string;
    };

export function isShadowingOkfhExecutable(executablePath: string): boolean {
  return !/[\\/]node_modules[\\/]\.bin[\\/]/.test(executablePath);
}

export function collectShadowingGlobalInstalls(options: {
  executablePath?: string;
  bootstrapVersion?: string;
}): DetectedShadowingGlobalInstall[] {
  const runtimeProfile = shadowingGlobalInstallProfiles[0];
  const bootstrapProfile = shadowingGlobalInstallProfiles[1];
  return [
    ...(options.executablePath === undefined
      ? []
      : [
          {
            id: runtimeProfile.id,
            label: runtimeProfile.label,
            executablePath: options.executablePath,
          } as const,
        ]),
    ...(options.bootstrapVersion === undefined
      ? []
      : [
          {
            id: bootstrapProfile.id,
            label: bootstrapProfile.label,
            packageName: bootstrapProfile.packageName,
            version: options.bootstrapVersion,
          } as const,
        ]),
  ];
}

export function parseGlobalPackageVersion(stdout: string, packageName: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.dependencies)) {
      return undefined;
    }
    const installed = parsed.dependencies[packageName];
    return isRecord(installed) && typeof installed.version === "string"
      ? installed.version
      : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const supportedNativeIntegrationProfiles = [
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "okf-harness@okf-harness from the Claude Code marketplace",
    nativeInstallCommands: [
      { command: "claude", args: ["plugin", "marketplace", "add", "pumblus/okf-harness"] },
      { command: "claude", args: ["plugin", "install", "okf-harness@okf-harness"] },
    ],
  },
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "okf-harness@okf-harness from the Codex marketplace",
    nativeInstallCommands: [
      {
        command: "codex",
        args: ["plugin", "marketplace", "add", "pumblus/okf-harness", "--json"],
      },
      { command: "codex", args: ["plugin", "add", "okf-harness@okf-harness", "--json"] },
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    command: "opencode",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "opencode plugin @pumblus/okf-harness --global",
    nativeInstallCommands: [
      { command: "opencode", args: ["plugin", "@pumblus/okf-harness", "--global"] },
    ],
  },
  {
    id: "pi",
    label: "Pi",
    command: "pi",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "pi install npm:@pumblus/okf-harness",
    nativeInstallCommands: [{ command: "pi", args: ["install", "npm:@pumblus/okf-harness"] }],
  },
  {
    id: "hermes",
    label: "Hermes Agent",
    command: "hermes",
    supportLevel: "native-supported",
    defaultSelected: true,
    nativeInstall: "pumblus/okf-harness/okf-harness from the Hermes skill tap",
    nativeInstallCommands: [
      { command: "hermes", args: ["skills", "tap", "add", "pumblus/okf-harness"] },
      { command: "hermes", args: ["skills", "install", "pumblus/okf-harness/okf-harness"] },
    ],
  },
  {
    id: "openclaw",
    label: "OpenClaw",
    command: "openclaw",
    supportLevel: "native-supported",
    defaultSelected: false,
    nativeInstall: "@pumblus/okf-harness from the OpenClaw native skill registry",
    nativeInstallCommands: [
      { command: "openclaw", args: ["skills", "install", "@pumblus/okf-harness", "--global"] },
    ],
  },
] as const satisfies readonly NativeIntegrationProfile[];

export function nativeIntegrationProfile(id: NativeIntegrationId): NativeIntegrationProfile {
  const profile = supportedNativeIntegrationProfiles.find((entry) => entry.id === id);
  if (profile === undefined) {
    throw new Error(`Unsupported native integration: ${id}`);
  }
  return profile;
}
