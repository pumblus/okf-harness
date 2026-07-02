#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const nativeIntegrationPackageName = "@pumblus/okf-harness";
const nativeIntegrationPackageDir = "packages/native-integration";

const publishablePackages = [
  { name: "@okf-harness/core", dir: "packages/core" },
  { name: "@okf-harness/agent-pack", dir: "packages/agent-pack" },
  { name: "@okf-harness/cli", dir: "packages/cli" },
  { name: "@okf-harness/setup", dir: "packages/setup" },
  { name: nativeIntegrationPackageName, dir: nativeIntegrationPackageDir },
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
  return executable === "npm" || executable === "pnpm" || executable.endsWith(".cmd");
}

export function buildNativeHostSmokeEnv(baseEnv, paths) {
  const env = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "ComSpec",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NPM_CONFIG_REGISTRY",
  ]) {
    if (baseEnv[key] !== undefined) {
      env[key] = baseEnv[key];
    }
  }

  env.HOME = paths.home;
  env.USERPROFILE = paths.home;
  env.XDG_CACHE_HOME = paths.xdgCacheHome;
  env.XDG_CONFIG_HOME = paths.xdgConfigHome;
  env.XDG_DATA_HOME = paths.xdgDataHome;
  if (paths.opencodeConfigDir !== undefined) {
    env.OPENCODE_CONFIG_DIR = paths.opencodeConfigDir;
  }
  return env;
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
    await run(
      "pnpm",
      ["--recursive", "--filter", "@okf-harness/*", "--filter", "@pumblus/okf-harness", "build"],
      {
        cwd: repoRoot,
        stdio: "inherit",
      },
    );

    await writeFile(
      path.join(installDir, "package.json"),
      JSON.stringify({ private: true, type: "module" }, null, 2),
    );
    const bootstrapHome = path.join(tempRoot, "bootstrap-home");
    const bootstrapCodexState = path.join(tempRoot, "codex-state");
    const bootstrapClaudeHome = path.join(tempRoot, "claude-home");
    await mkdir(bootstrapHome, { recursive: true });
    await mkdir(bootstrapCodexState, { recursive: true });
    await mkdir(bootstrapClaudeHome, { recursive: true });
    const bootstrapCodexSkillRoot = path.join(bootstrapHome, ".agents");
    const bootstrapEnv = {
      ...process.env,
      CLAUDE_CONFIG_DIR: bootstrapClaudeHome,
      CODEX_HOME: bootstrapCodexState,
      HOME: bootstrapHome,
    };
    delete bootstrapEnv.CI;

    const tarballs = [];
    for (const packageInfo of publishablePackages) {
      const packageDir = path.join(repoRoot, packageInfo.dir);
      const result = await run("npm", ["pack", "--pack-destination", packDir, "--json"], {
        cwd: packageDir,
      });
      const packOutput = JSON.parse(result.stdout);
      const packedPackage = packOutput[0];
      const filename = packedPackage?.filename;
      if (typeof filename !== "string" || filename.length === 0) {
        throw new Error(`npm pack did not return a tarball filename for ${packageInfo.name}`);
      }
      assertPackedPackageContents(packageInfo, packedPackage);
      const tarballPath = path.isAbsolute(filename) ? filename : path.join(packDir, filename);
      tarballs.push(tarballPath);
      console.log(`packed ${packageInfo.name}: ${path.basename(tarballPath)}`);
    }

    await runOpenCodePluginInstallSmoke(tempRoot, path.join(repoRoot, nativeIntegrationPackageDir));
    await runPiInstallSmoke(tempRoot);

    console.log("installing local tarballs");
    await run("npm", ["install", "--no-audit", "--no-fund", ...tarballs], {
      cwd: installDir,
      env: bootstrapEnv,
    });
    await assertNativeIntegrationPackage(installDir);
    const agentPackVersion = await installedPackageVersion(installDir, "@okf-harness/agent-pack");
    await assertGeneratedSkill(
      path.join(bootstrapCodexSkillRoot, "skills/okf-harness-bootstrap/SKILL.md"),
      agentPackVersion,
      "bootstrap",
      "codex",
    );
    await assertGeneratedSkill(
      path.join(bootstrapClaudeHome, "skills/okf-harness-bootstrap/SKILL.md"),
      agentPackVersion,
      "bootstrap",
      "claude",
    );
    console.log("postinstall bootstrap passed");

    const setupPlan = await runInstalledPackageBin(
      installDir,
      "@okf-harness/setup",
      "okf-harness-setup",
      ["--dry-run"],
      { env: { ...bootstrapEnv, PATH: path.dirname(process.execPath) } },
    );
    if (
      !setupPlan.stdout.includes("OKF Harness Setup plan") ||
      !setupPlan.stdout.includes("Dry run: no network checks or filesystem writes.")
    ) {
      throw new Error(`setup dry-run smoke failed: ${setupPlan.stdout}`);
    }
    console.log("setup dry-run plan passed");

    for (const binName of ["okfh", "okf-harness"]) {
      const result = await runInstalledBin(installDir, binName, ["doctor", "--json"], {
        env: bootstrapEnv,
      });
      const envelope = JSON.parse(result.stdout);
      if (envelope.ok !== true || envelope.data?.summary?.fail !== 0) {
        throw new Error(`${binName} doctor smoke failed: ${result.stdout}`);
      }
      assertCheckAbsent(envelope, "runtime-pnpm", `${binName} default doctor`);
      assertCheckStatus(envelope, "global-bootstrap-codex", "pass", `${binName} default doctor`);
      assertCheckStatus(envelope, "global-bootstrap-claude", "pass", `${binName} default doctor`);
      const summary = envelope.data.summary;
      console.log(
        `${binName} doctor passed: ${summary.pass} pass, ${summary.warn} warn, ${summary.skip} skip`,
      );
    }

    const devDoctor = JSON.parse(
      (
        await runInstalledBin(installDir, "okfh", ["doctor", "--dev", "--json"], {
          env: bootstrapEnv,
        })
      ).stdout,
    );
    assertCheckStatus(devDoctor, "runtime-pnpm", "pass", "okfh doctor --dev");
    console.log("okfh doctor --dev passed");

    const bootstrapInstall = JSON.parse(
      (
        await runInstalledBin(
          installDir,
          "okfh",
          ["bootstrap", "install", "--agents", "all", "--json"],
          { env: bootstrapEnv },
        )
      ).stdout,
    );
    assertBootstrapAllState(bootstrapInstall, "installed", "bootstrap install");
    await assertGeneratedSkill(
      path.join(bootstrapCodexSkillRoot, "skills/okf-harness-bootstrap/SKILL.md"),
      agentPackVersion,
      "bootstrap",
      "codex",
    );
    await assertGeneratedSkill(
      path.join(bootstrapClaudeHome, "skills/okf-harness-bootstrap/SKILL.md"),
      agentPackVersion,
      "bootstrap",
      "claude",
    );
    for (const reference of ["setup.md", "discovery.md", "repair.md"]) {
      await readFile(
        path.join(bootstrapCodexSkillRoot, "skills/okf-harness-bootstrap/references", reference),
        "utf8",
      );
      await readFile(
        path.join(bootstrapClaudeHome, "skills/okf-harness-bootstrap/references", reference),
        "utf8",
      );
    }
    const bootstrapStatus = JSON.parse(
      (
        await runInstalledBin(
          installDir,
          "okfh",
          ["bootstrap", "status", "--agents", "all", "--json"],
          { env: bootstrapEnv },
        )
      ).stdout,
    );
    assertBootstrapAllState(bootstrapStatus, "installed", "bootstrap status");
    const bootstrapUninstall = JSON.parse(
      (
        await runInstalledBin(
          installDir,
          "okfh",
          ["bootstrap", "uninstall", "--agents", "all", "--json"],
          { env: bootstrapEnv },
        )
      ).stdout,
    );
    assertBootstrapAllState(bootstrapUninstall, "missing", "bootstrap uninstall");
    console.log("codex and claude bootstrap lifecycle passed");

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

function runInstalledBin(installDir, binName, args, options = {}) {
  return runInstalledPackageBin(installDir, "@okf-harness/cli", binName, args, options);
}

function runInstalledPackageBin(installDir, packageName, binName, args, options = {}) {
  return assertInstalledPackageBinTarget(installDir, packageName, binName, "dist/main.js").then(
    () =>
      run(resolveLocalBinPath(installDir, binName), args, { cwd: installDir, env: options.env }),
  );
}

async function assertInstalledPackageBinTarget(installDir, packageName, binName, expectedTarget) {
  const packageRoot = path.join(installDir, "node_modules", ...packageName.split("/"));
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  const binTarget = packageJson.bin?.[binName];
  if (binTarget !== expectedTarget) {
    throw new Error(
      `Installed ${packageName} bin ${binName} points to ${JSON.stringify(binTarget)}`,
    );
  }
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
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

function assertPackedPackageContents(packageInfo, packedPackage) {
  if (packageInfo.name !== nativeIntegrationPackageName) {
    return;
  }

  const files = new Set((packedPackage.files ?? []).map((file) => file.path));
  for (const expected of [
    "package.json",
    "README.md",
    "dist/opencode.js",
    "dist/opencode.d.ts",
    "skills/okf-harness-bootstrap/SKILL.md",
  ]) {
    if (!files.has(expected)) {
      throw new Error(`${nativeIntegrationPackageName} tarball missing ${expected}`);
    }
  }
  for (const forbidden of [
    "src/opencode.ts",
    "test/package.test.ts",
    "skills/okf-harness/SKILL.md",
  ]) {
    if (files.has(forbidden)) {
      throw new Error(`${nativeIntegrationPackageName} tarball should not include ${forbidden}`);
    }
  }
}

async function assertNativeIntegrationPackage(installDir) {
  const packageRoot = path.join(installDir, "node_modules", "@pumblus", "okf-harness");
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  if (packageJson.bin !== undefined) {
    throw new Error(`${nativeIntegrationPackageName} must not publish CLI bins`);
  }
  if (packageJson.scripts?.postinstall !== undefined) {
    throw new Error(`${nativeIntegrationPackageName} must not run postinstall hooks`);
  }
  if (packageJson.pi?.skills?.[0] !== "./skills") {
    throw new Error(`${nativeIntegrationPackageName} missing Pi skills declaration`);
  }

  const skillFiles = await listFiles(path.join(packageRoot, "skills"));
  if (JSON.stringify(skillFiles) !== JSON.stringify(["okf-harness-bootstrap/SKILL.md"])) {
    throw new Error(
      `${nativeIntegrationPackageName} exposes unexpected skills: ${skillFiles.join(", ")}`,
    );
  }

  const skill = await readFile(
    path.join(packageRoot, "skills/okf-harness-bootstrap/SKILL.md"),
    "utf8",
  );
  for (const expected of [
    "name: okf-harness-bootstrap",
    'okf-harness-entrypoint: "bootstrap"',
    "npm install -g @okf-harness/cli",
    "Do not install, update, or replace the runtime",
  ]) {
    if (!skill.includes(expected)) {
      throw new Error(`@pumblus/okf-harness skill missing ${expected}`);
    }
  }

  const opencodeConfigDir = path.join(installDir, "opencode-config");
  const pluginUrl = pathToFileURL(path.join(packageRoot, "dist/opencode.js")).href;
  await run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        `const mod = await import(${JSON.stringify(pluginUrl)});`,
        'if (typeof mod.default !== "function") throw new Error("missing default plugin export");',
        "const hooks = await mod.default();",
        'if (!hooks || typeof hooks !== "object") throw new Error("plugin did not return hooks object");',
      ].join("\n"),
    ],
    {
      cwd: installDir,
      env: buildNativeHostSmokeEnv(process.env, {
        home: path.join(installDir, "opencode-home"),
        xdgCacheHome: path.join(installDir, "opencode-cache"),
        xdgConfigHome: path.join(installDir, "opencode-xdg-config"),
        xdgDataHome: path.join(installDir, "opencode-data"),
        opencodeConfigDir,
      }),
    },
  );
  const syncedSkill = await readFile(
    path.join(opencodeConfigDir, "skills/okf-harness-bootstrap/SKILL.md"),
    "utf8",
  );
  if (!syncedSkill.includes("name: okf-harness-bootstrap")) {
    throw new Error("OpenCode plugin did not sync the global bootstrap skill");
  }
  console.log("native integration package contents passed");
}

async function runOpenCodePluginInstallSmoke(tempRoot, localPluginSpec) {
  if (!(await commandExists("opencode"))) {
    console.log("opencode CLI not found; skipped OpenCode plugin install smoke");
    return;
  }

  const home = path.join(tempRoot, "opencode-home");
  const xdgConfigHome = path.join(tempRoot, "opencode-xdg-config");
  const xdgCacheHome = path.join(tempRoot, "opencode-xdg-cache");
  const xdgDataHome = path.join(tempRoot, "opencode-xdg-data");
  const opencodeConfigDir = path.join(tempRoot, "opencode-config");
  await mkdir(home, { recursive: true });
  await mkdir(xdgConfigHome, { recursive: true });
  await mkdir(xdgCacheHome, { recursive: true });
  await mkdir(xdgDataHome, { recursive: true });
  await mkdir(opencodeConfigDir, { recursive: true });

  const registrySmoke = process.env.OKFH_OPENCODE_REGISTRY_SMOKE === "1";
  const published =
    registrySmoke || (await isPublishedPackageVersion(nativeIntegrationPackageName));
  const pluginSpec = published ? nativeIntegrationPackageName : localPluginSpec;
  await run("opencode", ["plugin", pluginSpec, "--global"], {
    cwd: tempRoot,
    env: buildNativeHostSmokeEnv(process.env, {
      home,
      xdgCacheHome,
      xdgConfigHome,
      xdgDataHome,
      opencodeConfigDir,
    }),
  });

  const configText = await readFirstExistingFile([
    path.join(opencodeConfigDir, "opencode.json"),
    path.join(opencodeConfigDir, "opencode.jsonc"),
    path.join(opencodeConfigDir, "config.json"),
    path.join(xdgConfigHome, "opencode/opencode.json"),
    path.join(xdgConfigHome, "opencode/opencode.jsonc"),
    path.join(xdgConfigHome, "opencode/config.json"),
    path.join(home, ".config/opencode/opencode.json"),
    path.join(home, ".config/opencode/opencode.jsonc"),
    path.join(home, ".config/opencode/config.json"),
  ]);
  if (!configText.includes(pluginSpec)) {
    throw new Error(`OpenCode global config missing ${pluginSpec}: ${configText}`);
  }
  if (!published) {
    console.log(
      `opencode local plugin install smoke passed; registry smoke gap: run opencode plugin ${nativeIntegrationPackageName} --global after the package version is published.`,
    );
    return;
  }
  console.log("opencode registry plugin install smoke passed");
}

async function isPublishedPackageVersion(packageName) {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, nativeIntegrationPackageDir, "package.json"), "utf8"),
  );
  try {
    const result = await run("npm", ["view", `${packageName}@${packageJson.version}`, "version"], {
      cwd: repoRoot,
    });
    return result.stdout.trim() === packageJson.version;
  } catch {
    return false;
  }
}

async function runPiInstallSmoke(tempRoot) {
  if (!(await commandExists("pi"))) {
    console.log(
      "pi CLI not found; manual release checklist gap: run pi install npm:@pumblus/okf-harness before release.",
    );
    return;
  }
  if (
    process.env.OKFH_PI_REGISTRY_SMOKE !== "1" &&
    !(await isPublishedPackageVersion(nativeIntegrationPackageName))
  ) {
    throw new Error(
      `pi CLI found but ${nativeIntegrationPackageName} is not published at the current version; run pi install npm:${nativeIntegrationPackageName} after publishing.`,
    );
  }

  const home = path.join(tempRoot, "pi-home");
  const xdgConfigHome = path.join(tempRoot, "pi-xdg-config");
  const xdgCacheHome = path.join(tempRoot, "pi-xdg-cache");
  const xdgDataHome = path.join(tempRoot, "pi-xdg-data");
  await mkdir(home, { recursive: true });
  await mkdir(xdgConfigHome, { recursive: true });
  await mkdir(xdgCacheHome, { recursive: true });
  await mkdir(xdgDataHome, { recursive: true });
  await run("pi", ["install", `npm:${nativeIntegrationPackageName}`], {
    cwd: tempRoot,
    env: buildNativeHostSmokeEnv(process.env, {
      home,
      xdgCacheHome,
      xdgConfigHome,
      xdgDataHome,
    }),
  });
  console.log("pi package install smoke passed");
}

async function commandExists(command) {
  try {
    await run(command, ["--version"], { cwd: repoRoot });
    return true;
  } catch {
    return false;
  }
}

async function readFirstExistingFile(files) {
  for (const file of files) {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  throw new Error(`None of the expected config files exist: ${files.join(", ")}`);
}

async function assertGeneratedSkill(
  skillPath,
  expectedVersion,
  expectedEntrypoint = "workspace",
  expectedAgent,
) {
  const contents = await readFile(skillPath, "utf8");
  if (!contents.includes(`okf-harness-version: "${expectedVersion}"`)) {
    throw new Error(
      `Generated skill does not contain expected version ${expectedVersion}: ${skillPath}`,
    );
  }
  if (!contents.includes('okf-harness-managed: "true"')) {
    throw new Error(`Generated skill does not use string managed metadata: ${skillPath}`);
  }
  if (!contents.includes(`okf-harness-entrypoint: "${expectedEntrypoint}"`)) {
    throw new Error(`Generated skill does not use ${expectedEntrypoint} metadata: ${skillPath}`);
  }
  if (
    expectedEntrypoint === "bootstrap" &&
    !contents.includes(`okf-harness-agent: "${expectedAgent ?? "codex"}"`)
  ) {
    throw new Error(`Generated bootstrap skill does not use expected agent metadata: ${skillPath}`);
  }
}

function assertBootstrapAllState(envelope, expectedState, label) {
  const agents = Array.isArray(envelope.data?.agents) ? envelope.data.agents : [];
  for (const agent of ["codex", "claude"]) {
    const entry = agents.find((candidate) => candidate?.agent === agent);
    const state = entry?.status?.state ?? entry?.result?.status?.state;
    if (envelope.ok !== true || state !== expectedState) {
      throw new Error(`${label} expected ${agent} ${expectedState}: ${JSON.stringify(envelope)}`);
    }
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
