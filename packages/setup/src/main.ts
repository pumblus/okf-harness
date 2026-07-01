#!/usr/bin/env node
import { runSetup } from "./index.js";

const result = await runSetup(process.argv);
process.exitCode = result.exitCode;
