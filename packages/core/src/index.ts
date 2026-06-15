export const packageInfo = {
  name: "@okf-harness/core",
  role: "core",
  phase: 4,
} as const;

export type PackageInfo = typeof packageInfo;

export * from "./config/index.js";
export * from "./lint/index.js";
export * from "./okf/concepts.js";
export * from "./okf/frontmatter.js";
export * from "./paths/index.js";
export * from "./source/index.js";
export * from "./workspace/index.js";
