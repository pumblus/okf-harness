import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@okf-harness/agent-pack": new URL("./packages/agent-pack/src/index.ts", import.meta.url)
        .pathname,
      "@okf-harness/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@okf-harness/mcp": new URL("./packages/mcp/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    passWithNoTests: false,
  },
});
