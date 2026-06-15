export const packageInfo = {
  name: "@okf-harness/cli",
  role: "cli",
  phase: 0,
} as const;

export type PackageInfo = typeof packageInfo;
