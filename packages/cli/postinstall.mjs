#!/usr/bin/env node
import { existsSync } from "node:fs";

const distPostinstall = new URL("./dist/postinstall.js", import.meta.url);

if (existsSync(distPostinstall)) {
  try {
    const { runPostinstall } = await import(distPostinstall.href);
    await runPostinstall();
  } catch {
    console.log("OKF Harness installed. Run okfh doctor --json.");
  }
}
