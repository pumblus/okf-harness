import { copyFile, mkdir, readFile, rm, rmdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillName = "okf-harness";
const legacySkillName = "okf-harness-bootstrap";
const managedMarker = 'okf-harness-managed: "true"';

export const OkfHarnessPlugin = async () => {
  await syncHostSkill();
  return {};
};

export default OkfHarnessPlugin;

async function syncHostSkill() {
  const source = path.resolve(packageRoot(), "skills", skillName, "SKILL.md");
  const targetDir = path.join(resolveOpenCodeConfigDir(), "skills", skillName);
  const target = path.join(targetDir, "SKILL.md");
  const sourceContents = await readFile(source, "utf8");

  if ((await readSkillOwnership(target)) === "user-owned") {
    return;
  }

  await mkdir(targetDir, { recursive: true });
  await copyFile(source, target);

  const targetContents = await readFile(target, "utf8");
  if (targetContents !== sourceContents) {
    throw new Error(`Failed to verify synced ${skillName} skill contents.`);
  }

  const legacyDir = path.join(resolveOpenCodeConfigDir(), "skills", legacySkillName);
  const legacySkill = path.join(legacyDir, "SKILL.md");
  if ((await readSkillOwnership(legacySkill)) === "managed") {
    await rm(legacySkill, { force: true });
    await removeEmptyDirectory(legacyDir);
  }
}

async function readSkillOwnership(target: string): Promise<"managed" | "user-owned" | "missing"> {
  try {
    return hasManagedFrontmatter(await readFile(target, "utf8")) ? "managed" : "user-owned";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}

function hasManagedFrontmatter(contents: string): boolean {
  if (!contents.startsWith("---\n")) {
    return false;
  }
  const end = contents.indexOf("\n---", 4);
  return end !== -1 && contents.slice(4, end).split("\n").includes(`  ${managedMarker}`);
}

async function removeEmptyDirectory(directory: string) {
  try {
    await rmdir(directory);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTEMPTY" || error.code === "EEXIST")
    ) {
      return;
    }
    throw error;
  }
}

function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function resolveOpenCodeConfigDir() {
  if (process.env.OPENCODE_CONFIG_DIR) {
    return process.env.OPENCODE_CONFIG_DIR;
  }
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "opencode");
  }
  return path.join(homedir(), ".config", "opencode");
}
