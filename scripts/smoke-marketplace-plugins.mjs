import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginId = "okf-harness@okf-harness";
const bootstrapSkill = "skills/okf-harness-bootstrap/SKILL.md";
const expectedReferences = [
  "skills/okf-harness-bootstrap/references/discovery.md",
  "skills/okf-harness-bootstrap/references/repair.md",
  "skills/okf-harness-bootstrap/references/setup.md",
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
      ".codex-plugin/plugin.json",
      bootstrapSkill,
      ...expectedReferences,
    ]);
    await assertBootstrapSkill(install.installedPath);
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
    assert.match(details, /Skills \(1\)\s+okf-harness-bootstrap/);
    assert.deepEqual(await listFiles(install.installPath), [
      ".claude-plugin/plugin.json",
      bootstrapSkill,
      ...expectedReferences,
    ]);
    await assertBootstrapSkill(install.installPath);
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

async function assertBootstrapSkill(root) {
  const skill = await readFile(path.join(root, bootstrapSkill), "utf8");
  assert.match(skill, /^name: okf-harness-bootstrap$/m);
  assert.match(skill, /npm install -g @okf-harness\/cli/);
  assert.match(skill, /okfh doctor --json/);
  assert.doesNotMatch(skill, /npx @okf-harness\/setup@latest/);
  assert.doesNotMatch(skill, /^name: okf-harness$/m);
}
