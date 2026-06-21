import path from "node:path";
import { type SearchWorkspaceResult, searchWorkspace } from "../search/index.js";

export type EvidenceCandidate = {
  item: number;
  conceptId: string;
  path: string;
  title: string;
  type: string;
  matchedFields: string[];
  matchReasons: string[];
};

export type EvidenceLimit = {
  code: string;
  message: string;
};

export type EvidenceBriefResult = {
  workspaceRoot: string;
  question: string;
  evidence: [];
  candidates: EvidenceCandidate[];
  limits: EvidenceLimit[];
  guidance: string[];
  warnings: SearchWorkspaceResult["warnings"];
};

export type PlanEvidenceBriefOptions = {
  workspaceRoot: string;
  question: string;
};

export async function planEvidenceBrief(
  options: PlanEvidenceBriefOptions,
): Promise<EvidenceBriefResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const search = await searchWorkspace({
    workspaceRoot,
    query: options.question,
  });
  const candidates = search.results.map((result, index) => ({
    item: index + 1,
    conceptId: result.conceptId,
    path: result.path,
    title: result.title,
    type: result.type,
    matchedFields: result.matchedFields,
    matchReasons: [...new Set(result.scoreBreakdown.map((item) => item.reason))],
  }));

  return {
    workspaceRoot,
    question: options.question,
    evidence: [],
    candidates,
    limits:
      search.totalMatches === 0
        ? [
            {
              code: "NO_MATCHES",
              message: "No synthesized wiki concept documents matched the question.",
            },
          ]
        : [],
    guidance:
      search.totalMatches === 0
        ? [
            "Treat this as a successful no-match result, not a command failure.",
            "Disclose that the synthesized wiki has no evidence for the question unless the user asks to broaden the search.",
          ]
        : ["Use thin candidates only for bounded follow-up reads; do not treat them as evidence."],
    warnings: search.warnings,
  };
}
