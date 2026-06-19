#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const publishablePackages = [
  { name: "@okf-harness/core", dir: "packages/core" },
  { name: "@okf-harness/agent-pack", dir: "packages/agent-pack" },
  { name: "@okf-harness/cli", dir: "packages/cli" },
];

if (isDirectRun(import.meta.url, process.argv[1])) {
  await main();
}

export function resolveLocalBinPath(installDir, binName, runtimePlatform = process.platform) {
  const shimName = runtimePlatform === "win32" ? `${binName}.cmd` : binName;
  const pathModule = runtimePlatform === "win32" ? path.win32 : path;
  return pathModule.join(installDir, "node_modules", ".bin", shimName);
}

export function shouldRunWithShell(command, runtimePlatform = process.platform) {
  if (runtimePlatform !== "win32") {
    return false;
  }
  const executable = path.basename(command).toLowerCase();
  return executable === "npm" || executable === "pnpm";
}

async function main() {
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
      const binPath = resolveLocalBinPath(installDir, binName);
      await access(binPath);
      const result = await runInstalledBin(installDir, binName, ["doctor", "--json"]);
      const envelope = JSON.parse(result.stdout);
      if (envelope.ok !== true || envelope.data?.summary?.fail !== 0) {
        throw new Error(`${binName} doctor smoke failed: ${result.stdout}`);
      }
      assertCheckAbsent(envelope, "pnpm", `${binName} default doctor`);
      const summary = envelope.data.summary;
      console.log(
        `${binName} doctor passed: ${summary.pass} pass, ${summary.warn} warn, ${summary.skip} skip`,
      );
    }

    const devDoctor = JSON.parse(
      (await runInstalledBin(installDir, "okfh", ["doctor", "--dev", "--json"])).stdout,
    );
    assertCheckStatus(devDoctor, "pnpm", "pass", "okfh doctor --dev");
    console.log("okfh doctor --dev passed");

    const workspace = path.join(tempRoot, "workspace");
    await runInstalledBin(installDir, "okfh", [
      "init",
      workspace,
      "--name",
      "Smoke Workspace",
      "--agents",
      "codex",
      "--git",
      "--json",
    ]);
    const agentPackVersion = await installedPackageVersion(installDir, "@okf-harness/agent-pack");
    await assertGeneratedSkill(
      path.join(workspace, ".agents/skills/okf-harness/SKILL.md"),
      agentPackVersion,
    );
    console.log("codex init generated a strict skill");

    await runInstalledBin(installDir, "okfh", [
      "agent",
      "install",
      "claude",
      "--workspace",
      workspace,
      "--json",
    ]);
    await assertGeneratedSkill(
      path.join(workspace, ".claude/skills/okf-harness/SKILL.md"),
      agentPackVersion,
    );
    console.log("claude adapter install generated a strict skill");

    await writeFile(
      path.join(workspace, "wiki/index.md"),
      '---\nokf_version: "0.1"\ncustom_bundle_field: local\n---\n# Smoke Workspace Wiki\n\n- [LLM Wiki](topics/llm-wiki.md)\n- [Karpathy LLM Wiki gist](references/karpathy-llm-wiki.md)\n',
      "utf8",
    );
    const check = JSON.parse(
      (await runInstalledBin(installDir, "okfh", ["check", "--workspace", workspace, "--json"]))
        .stdout,
    );
    if (check.ok !== true || check.data?.status === "blocked") {
      throw new Error(`root index okf_version check failed: ${JSON.stringify(check)}`);
    }
    console.log("root index okf_version check passed");

    const oldCustomSkill = path.join(workspace, ".agents/skills/okf-harness-query");
    await mkdir(oldCustomSkill, { recursive: true });
    await writeFile(
      path.join(oldCustomSkill, "SKILL.md"),
      "---\nname: okf-harness-query\n---\n\n# Custom Query\n",
      "utf8",
    );
    await writeFile(path.join(oldCustomSkill, "notes.md"), "custom notes\n", "utf8");
    const oldManagedSkill = path.join(workspace, ".claude/skills/okf-harness-init");
    await mkdir(oldManagedSkill, { recursive: true });
    await writeFile(
      path.join(oldManagedSkill, "SKILL.md"),
      '---\nname: okf-harness-init\nmetadata:\n  okf-harness-managed: "true"\n---\n',
      "utf8",
    );
    await writeFile(path.join(oldManagedSkill, "extra.md"), "keep me\n", "utf8");
    await runInstalledBin(installDir, "okfh", [
      "agent",
      "install",
      "all",
      "--workspace",
      workspace,
      "--json",
    ]);
    const backupFiles = await listFiles(path.join(workspace, ".okfh/backups/agent-skills"));
    assertIncludesMatching(
      backupFiles,
      /\.agents\/skills\/okf-harness-query\/SKILL\.md$/,
      "custom old skill backup",
    );
    assertIncludesMatching(
      backupFiles,
      /\.agents\/skills\/okf-harness-query\/notes\.md$/,
      "custom old skill extra-file backup",
    );
    assertIncludesMatching(
      backupFiles,
      /\.claude\/skills\/okf-harness-init\/SKILL\.md$/,
      "managed old skill backup",
    );
    assertIncludesMatching(
      backupFiles,
      /\.claude\/skills\/okf-harness-init\/extra\.md$/,
      "managed old skill extra-file backup",
    );
    console.log("legacy skill backup migration passed");

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
}

function runInstalledBin(installDir, binName, args) {
  return run("npm", ["exec", "--", binName, ...args], { cwd: installDir });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: shouldRunWithShell(command),
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

async function installedPackageVersion(installDir, packageName) {
  const packageJson = JSON.parse(
    await readFile(
      path.join(installDir, "node_modules", ...packageName.split("/"), "package.json"),
      "utf8",
    ),
  );
  if (typeof packageJson.version !== "string") {
    throw new Error(`Installed package version missing for ${packageName}`);
  }
  return packageJson.version;
}

async function assertGeneratedSkill(skillPath, expectedVersion) {
  const contents = await readFile(skillPath, "utf8");
  if (!contents.includes(`okf-harness-version: "${expectedVersion}"`)) {
    throw new Error(
      `Generated skill does not contain expected version ${expectedVersion}: ${skillPath}`,
    );
  }
  if (!contents.includes('okf-harness-managed: "true"')) {
    throw new Error(`Generated skill does not use string managed metadata: ${skillPath}`);
  }
}

function assertCheckStatus(envelope, checkId, status, label) {
  const checks = Array.isArray(envelope.data?.checks) ? envelope.data.checks : [];
  const check = checks.find((candidate) => candidate?.id === checkId);
  if (check?.status !== status) {
    throw new Error(`${label} expected ${checkId} ${status}: ${JSON.stringify(envelope)}`);
  }
}

function assertCheckAbsent(envelope, checkId, label) {
  const checks = Array.isArray(envelope.data?.checks) ? envelope.data.checks : [];
  if (checks.some((candidate) => candidate?.id === checkId)) {
    throw new Error(`${label} should not include ${checkId}: ${JSON.stringify(envelope)}`);
  }
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        return listFiles(root, entryPath);
      }
      return [path.relative(root, entryPath).split(path.sep).join(path.posix.sep)];
    }),
  );
  return files.flat().sort();
}

function assertIncludesMatching(values, pattern, label) {
  if (!values.some((value) => pattern.test(value))) {
    throw new Error(`${label} missing. Found: ${values.join(", ")}`);
  }
}

function isDirectRun(moduleUrl, argvPath) {
  return argvPath !== undefined && moduleUrl === pathToFileURL(argvPath).href;
}
