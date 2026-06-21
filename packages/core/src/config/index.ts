import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { safeResolveWorkspacePath } from "../paths/index.js";

export const CONFIG_INVALID = "CONFIG_INVALID" as const;

const configRelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => isSafeConfigRelativePath(value), {
    message: "Path must be a non-empty workspace-relative POSIX path without traversal.",
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
        require_git_checkpoint_before_agent_write: z.boolean(),
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
  | { ok: false; issues: ConfigIssue[] };

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
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: CONFIG_INVALID,
        path: issue.path.length > 0 ? issue.path.join(".") : "<root>",
        message: issue.message,
      })),
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

function isSafeConfigRelativePath(value: string): boolean {
  if (value.startsWith("/") || value.includes("\\")) {
    return false;
  }

  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "..");
}
