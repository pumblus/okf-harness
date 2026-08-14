import type { CliIo, JsonEnvelope } from "../types.js";

export type HumanRenderer = (envelope: JsonEnvelope) => string;

/** Command-name table for human rendering; commands without a declared renderer get the generic fallback. */
// Process-global: one renderer per command name, last registration wins.
const humanRenderers = new Map<string, HumanRenderer>();

export function registerHumanRenderer(command: string, renderer: HumanRenderer): void {
  humanRenderers.set(command, renderer);
}

export function writeResult(io: CliIo, envelope: JsonEnvelope, json = false): void {
  if (json) {
    io.writeOut(`${JSON.stringify(envelope)}\n`);
    return;
  }

  const renderer = humanRenderers.get(envelope.command);
  if (renderer !== undefined) {
    io.writeOut(renderer(envelope));
    return;
  }

  io.writeOut(`${envelope.ok ? "OK" : "FAILED"} ${envelope.command}\n`);
}
