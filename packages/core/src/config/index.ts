import { readFile, writeFile } from "node:fs/promises";
import { parseDocument, parse as parseYaml } from "yaml";
import { z } from "zod";
import { safeResolveWorkspacePath } from "../paths/index.js";
import { harnessRuntimeVersion } from "../version.js";

export const CONFIG_INVALID = "CONFIG_INVALID" as const;

const configRelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => isSafeConfigRelativePath(value), {
    message: "Path must be a non-empty workspace-relative POSIX path without traversal.",
  });

// The pin answers "which code may write this workspace", so it must be one exact
// version. A range or a dist-tag would leave that unanswerable from the workspace alone.
const exactVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, {
    message: "Runtime pin must be an exact version such as 0.6.0, not a range or a dist-tag.",
  });

export const workspaceConfigSchema = z
  .object({
    version: z.union([z.literal(0.1), z.literal("0.1")]).transform(() => "0.1" as const),
    workspace: z
      .object({
        name: z.string().min(1),
        created_at: z.string().min(1),
      })
      .strict(),
    // Optional: workspaces created before pins existed keep parsing and report a missing pin.
    runtime: z
      .object({
        version: exactVersionSchema,
      })
      .strict()
      .optional(),
    okf: z
      .object({
        bundle_root: configRelativePathSchema,
        profile: z.string().min(1),
      })
      .strict(),
    agents: z
      .object({
        tier1: z
          .object({
            claude: z.boolean(),
            codex: z.boolean(),
          })
          .strict(),
        tier2: z
          .object({
            pi: z.boolean(),
            opencode: z.boolean(),
          })
          .strict(),
      })
      .strict()
      .optional(),
    paths: z
      .object({
        raw_inbox: configRelativePathSchema,
        raw_sources: configRelativePathSchema,
        wiki_root: configRelativePathSchema,
        manifest: configRelativePathSchema,
      })
      .strict(),
    safety: z
      .object({
        raw_sources_immutable: z.boolean().optional(),
        // Compatibility-only no-op for workspaces created before recovery became automatic.
        require_git_checkpoint_before_agent_write: z.boolean().optional(),
        max_files_changed_per_ingest: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .refine((config) => config.okf.bundle_root === config.paths.wiki_root, {
    path: ["paths", "wiki_root"],
    message: "paths.wiki_root must match okf.bundle_root.",
  });

export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

export type ConfigIssue = {
  code: typeof CONFIG_INVALID;
  path: string;
  message: string;
};

export type WorkspaceConfigParseResult =
  | { ok: true; config: WorkspaceConfig }
  | { ok: false; issues: ConfigIssue[]; bundleRoot?: string };

export class WorkspaceConfigError extends Error {
  readonly code = CONFIG_INVALID;

  constructor(readonly issues: ConfigIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "WorkspaceConfigError";
  }
}

export function parseWorkspaceConfig(source: string): WorkspaceConfigParseResult {
  let rawConfig: unknown;

  try {
    rawConfig = parseYaml(source);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: CONFIG_INVALID,
          path: "<yaml>",
          message: error instanceof Error ? error.message : "Invalid YAML.",
        },
      ],
    };
  }

  const parsed = workspaceConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const bundleRoot = bundleRootFromRawConfig(rawConfig);
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: CONFIG_INVALID,
        path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
        message: issue.message,
      })),
      ...(bundleRoot === undefined ? {} : { bundleRoot }),
    };
  }

  return { ok: true, config: parsed.data };
}

export async function readWorkspaceConfig(
  workspaceRoot: string,
): Promise<WorkspaceConfigParseResult> {
  let configPath: string;

  try {
    configPath = (await safeResolveWorkspacePath(workspaceRoot, "okfh.config.yaml")).absolutePath;
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: CONFIG_INVALID,
          path: "okfh.config.yaml",
          message:
            error instanceof Error ? error.message : "Could not resolve workspace config path.",
        },
      ],
    };
  }

  try {
    return parseWorkspaceConfig(await readFile(configPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: CONFIG_INVALID,
          path: "okfh.config.yaml",
          message: error instanceof Error ? error.message : "Could not read workspace config.",
        },
      ],
    };
  }
}

export async function loadWorkspaceConfig(workspaceRoot: string): Promise<WorkspaceConfig> {
  const result = await readWorkspaceConfig(workspaceRoot);
  if (!result.ok) {
    throw new WorkspaceConfigError(result.issues);
  }

  return result.config;
}

export type RuntimePinRecord = {
  version: string;
  state: "recorded" | "already-pinned" | "would-record";
};

/**
 * Records the running Harness runtime's version as the workspace runtime pin.
 * Already-pinned workspaces are left untouched, so this is safe to rerun.
 */
export async function recordRuntimePin(
  workspaceRoot: string,
  options: { dryRun?: boolean | undefined } = {},
): Promise<RuntimePinRecord> {
  const source = await readWorkspaceConfigSource(workspaceRoot);
  const parsed = parseWorkspaceConfig(source.contents);
  if (!parsed.ok) {
    throw new WorkspaceConfigError(parsed.issues);
  }

  const pinned = parsed.config.runtime?.version;
  if (pinned !== undefined) {
    return { version: pinned, state: "already-pinned" };
  }

  if (options.dryRun === true) {
    return { version: harnessRuntimeVersion, state: "would-record" };
  }

  // Edit the document rather than restringify the parsed config, so user comments survive.
  const document = parseDocument(source.contents);
  document.setIn(["runtime", "version"], harnessRuntimeVersion);
  await writeFile(source.path, String(document), "utf8");

  return { version: harnessRuntimeVersion, state: "recorded" };
}

/** Reads the config as text, reporting an unresolvable or unreadable file as CONFIG_INVALID. */
async function readWorkspaceConfigSource(
  workspaceRoot: string,
): Promise<{ path: string; contents: string }> {
  try {
    const configPath = (await safeResolveWorkspacePath(workspaceRoot, "okfh.config.yaml"))
      .absolutePath;
    return { path: configPath, contents: await readFile(configPath, "utf8") };
  } catch (error) {
    throw new WorkspaceConfigError([
      {
        code: CONFIG_INVALID,
        path: "okfh.config.yaml",
        message: error instanceof Error ? error.message : "Could not read workspace config.",
      },
    ]);
  }
}

function bundleRootFromRawConfig(rawConfig: unknown): string | undefined {
  if (typeof rawConfig !== "object" || rawConfig === null || Array.isArray(rawConfig)) {
    return undefined;
  }
  const okf = (rawConfig as { okf?: unknown }).okf;
  if (typeof okf !== "object" || okf === null || Array.isArray(okf)) {
    return undefined;
  }
  const parsed = configRelativePathSchema.safeParse((okf as { bundle_root?: unknown }).bundle_root);
  return parsed.success ? parsed.data : undefined;
}

function isSafeConfigRelativePath(value: string): boolean {
  if (value.startsWith("/") || value.includes("\\")) {
    return false;
  }

  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "..");
}
