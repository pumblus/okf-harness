import { readFileSync } from "node:fs";

/**
 * The running Harness runtime's own version, recorded as a workspace runtime pin.
 * Public packages release in lockstep, so this is also the `okfh` runtime version
 * a pin resolves to (release gate: internal dependencies at the same public version).
 */
export const harnessRuntimeVersion = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    version: string;
  }
).version;
