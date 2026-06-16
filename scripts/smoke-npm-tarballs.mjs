#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const publishablePackages = [
  { name: "@okf-harness/core", dir: "packages/core" },
  { name: "@okf-harness/agent-pack", dir: "packages/agent-pack" },
  { name: "@okf-harness/cli", dir: "packages/cli" },
];

const tempRoot = await mkdtemp(path.join(tmpdir(), "okfh-tarball-smoke-"));
const packDir = path.join(tempRoot, "packs");
const installDir = path.join(tempRoot, "install");

let keepTemp = process.env.OKFH_KEEP_SMOKE_TMP === "1";

try {
  console.log(`smoke temp: ${tempRoot}`);
  await mkdir(packDir, { recursive: true });
  await mkdir(installDir, { recursive: true });

  console.log("building workspace");
  await run("pnpm", ["build"], { cwd: repoRoot, stdio: "inherit" });

  await writeFile(
    path.join(installDir, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2),
  );

  const tarballs = [];
  for (const packageInfo of publishablePackages) {
    const packageDir = path.join(repoRoot, packageInfo.dir);
    const result = await run("npm", ["pack", "--pack-destination", packDir, "--json"], {
      cwd: packageDir,
    });
    const packOutput = JSON.parse(result.stdout);
    const filename = packOutput[0]?.filename;
    if (typeof filename !== "string" || filename.length === 0) {
      throw new Error(`npm pack did not return a tarball filename for ${packageInfo.name}`);
    }
    const tarballPath = path.isAbsolute(filename) ? filename : path.join(packDir, filename);
    tarballs.push(tarballPath);
    console.log(`packed ${packageInfo.name}: ${path.basename(tarballPath)}`);
  }

  console.log("installing local tarballs");
  await run("npm", ["install", "--no-audit", "--no-fund", ...tarballs], {
    cwd: installDir,
    stdio: "inherit",
  });

  for (const binName of ["okfh", "okf-harness"]) {
    const binPath = path.join(installDir, "node_modules", ".bin", binName);
    const result = await run(binPath, ["doctor", "--json"], { cwd: installDir });
    const envelope = JSON.parse(result.stdout);
    if (envelope.ok !== true || envelope.data?.summary?.fail !== 0) {
      throw new Error(`${binName} doctor smoke failed: ${result.stdout}`);
    }
    const summary = envelope.data.summary;
    console.log(
      `${binName} doctor passed: ${summary.pass} pass, ${summary.warn} warn, ${summary.skip} skip`,
    );
  }

  keepTemp = false;
  console.log("tarball smoke passed");
} catch (error) {
  keepTemp = true;
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`kept temp directory for inspection: ${tempRoot}`);
  process.exitCode = 1;
} finally {
  if (!keepTemp) {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          [`${command} ${args.join(" ")} exited with code ${code}`, stdout.trim(), stderr.trim()]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}
