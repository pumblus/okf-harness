import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginId = "okf-harness@okf-harness";
const hostSkill = "skills/okf-harness/SKILL.md";
const expectedReferences = [
  "skills/okf-harness/references/discovery.md",
  "skills/okf-harness/references/repair.md",
  "skills/okf-harness/references/setup.md",
];

await smokeCodex();
await smokeClaude();
console.log("marketplace plugin smoke passed");

async function smokeCodex() {
  const temp = await mkdtemp(path.join(tmpdir(), "okfh-codex-marketplace-"));
  const codexHome = path.join(temp, "codex-home");
  await mkdir(codexHome);
  const env = { ...process.env, CODEX_HOME: codexHome };
  try {
    parseJson(run("codex", ["plugin", "marketplace", "add", repoRoot, "--json"], { env }));
    const available = parseJson(
      run("codex", ["plugin", "list", "--marketplace", "okf-harness", "--available", "--json"], {
        env,
      }),
    );
    assert.equal(available.available?.[0]?.pluginId, pluginId);

    const install = parseJson(run("codex", ["plugin", "add", pluginId, "--json"], { env }));
    assert.equal(install.pluginId, pluginId);
    assert.deepEqual(await listFiles(install.installedPath), [
      "README.md",
      "plugin.json",
      hostSkill,
      ...expectedReferences,
    ]);
    await assertHostSkill(install.installedPath);
    await assertStorefront(install.installedPath);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

async function smokeClaude() {
  const temp = await mkdtemp(path.join(tmpdir(), "okfh-claude-marketplace-"));
  const home = path.join(temp, "home");
  await mkdir(home);
  const env = { ...process.env, HOME: home };
  try {
    run("claude", ["plugin", "validate", "--strict", ".claude-plugin/marketplace.json"], { env });
    run("claude", ["plugin", "validate", "--strict", "plugins/claude/okf-harness"], { env });
    run("claude", ["plugin", "marketplace", "add", repoRoot, "--scope", "user"], { env });

    const available = parseJson(
      run("claude", ["plugin", "list", "--available", "--json"], { env }),
    );
    assert.equal(available.available?.[0]?.pluginId, pluginId);

    run("claude", ["plugin", "install", pluginId, "--scope", "user"], { env });
    const [install] = parseJson(run("claude", ["plugin", "list", "--json"], { env }));
    assert.equal(install.id, pluginId);

    const details = run("claude", ["plugin", "details", "okf-harness"], { env });
    assert.match(details, /Skills \(1\)\s+okf-harness/);
    assert.deepEqual(await listFiles(install.installPath), [
      ".claude-plugin/plugin.json",
      hostSkill,
      ...expectedReferences,
    ]);
    await assertHostSkill(install.installPath);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: options.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with ${result.status}`,
        result.stdout,
        result.stderr,
      ].join("\n"),
    );
  }
  return result.stdout;
}

function parseJson(text) {
  return JSON.parse(text);
}

async function listFiles(root) {
  const files = [];
  await walk(root, root, files);
  return files.sort();
}

async function walk(root, current, files) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, entryPath, files);
      continue;
    }
    files.push(path.relative(root, entryPath).split(path.sep).join(path.posix.sep));
  }
}

async function assertStorefront(root) {
  const installed = JSON.parse(await readFile(path.join(root, "plugin.json"), "utf8"));
  const repoManifest = JSON.parse(
    await readFile(path.join(repoRoot, "plugins/agent-plugins/okf-harness/plugin.json"), "utf8"),
  );
  // The artifact test pins the repo manifest's storefront to the historical
  // Codex block; this proves the installed copy carries it intact.
  assert.deepEqual(
    installed.extensions["com.openai"].interface,
    repoManifest.extensions["com.openai"].interface,
  );
}

async function assertHostSkill(root) {
  const skill = await readFile(path.join(root, hostSkill), "utf8");
  assert.match(skill, /^name: okf-harness$/m);
  assert.match(skill, /^ {2}okf-harness-entrypoint: "host"$/m);
  assert.match(skill, /npx @okf-harness\/setup@latest launch/);
  assert.match(skill, /check --json/);
  assert.doesNotMatch(skill, /npm install -g @okf-harness\/cli/);
  assert.doesNotMatch(skill, /^name: okf-harness-bootstrap$/m);
}
