export const packageInfo = {
  name: "@okf-harness/agent-pack",
  role: "agent-pack",
  phase: 0,
} as const;

export type PackageInfo = typeof packageInfo;
