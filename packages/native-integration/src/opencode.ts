import { copyFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillName = "okf-harness-bootstrap";
const managedMarker = 'okf-harness-managed: "true"';

export const OkfHarnessBootstrapPlugin = async () => {
  await syncGlobalBootstrapSkill();
  return {};
};

export default OkfHarnessBootstrapPlugin;

async function syncGlobalBootstrapSkill() {
  const source = path.resolve(packageRoot(), "skills", skillName, "SKILL.md");
  const targetDir = path.join(resolveOpenCodeConfigDir(), "skills", skillName);
  const target = path.join(targetDir, "SKILL.md");
  const sourceContents = await readFile(source, "utf8");

  if (await hasUserOwnedSkill(target)) {
    return;
  }

  await mkdir(targetDir, { recursive: true });
  await copyFile(source, target);

  const targetContents = await readFile(target, "utf8");
  if (targetContents !== sourceContents) {
    throw new Error(`Failed to verify synced ${skillName} skill contents.`);
  }
}

async function hasUserOwnedSkill(target: string) {
  try {
    const contents = await readFile(target, "utf8");
    return !contents.includes(managedMarker);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
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
