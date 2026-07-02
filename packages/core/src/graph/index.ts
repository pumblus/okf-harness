import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadWorkspaceConfig } from "../config/index.js";
import { type OkfMarkdownFile, scanConcepts } from "../okf/concepts.js";
import { okfDocumentView } from "../okf/document.js";
import {
  parseBareReferenceTargets,
  parseMarkdownLinks,
  resolveOkfLinkTarget,
} from "../okf/links.js";

export const GRAPH_WRITE_FAILED = "GRAPH_WRITE_FAILED" as const;

export class GraphWorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: typeof GRAPH_WRITE_FAILED,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GraphWorkspaceError";
  }
}

export type GraphNode = {
  id: string;
  path: string;
  title: string;
  type: string;
  tags: string[];
};

export type GraphEdge = {
  from: string;
  to: string;
  kind: "link" | "citation";
};

export type GraphIssue = {
  code: string;
  message: string;
  path?: string;
};

export type MissingGraphTarget = {
  from: string;
  target: string;
  path: string;
};

export type GraphBacklinksData = {
  generatedAt: string;
  workspaceRoot: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  backlinks: Record<string, string[]>;
  issues: GraphIssue[];
  missingTargets: MissingGraphTarget[];
};

export type BuildWorkspaceGraphOptions = {
  workspaceRoot: string;
  now?: Date;
};

export type BuildWorkspaceGraphResult = {
  workspaceRoot: string;
  report: {
    backlinksPath: string;
    htmlPath: string;
  };
  stats: {
    nodes: number;
    conceptEdges: number;
    evidenceEdges: number;
    missingTargets: number;
  };
  issues: GraphIssue[];
  missingTargets: MissingGraphTarget[];
};

export async function buildWorkspaceGraph(
  options: BuildWorkspaceGraphOptions,
): Promise<BuildWorkspaceGraphResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const config = await loadWorkspaceConfig(workspaceRoot);
  const scanResult = await scanConcepts(workspaceRoot, config);
  const nodes = scanResult.files.filter((file) => !file.isReserved).map(graphNodeFromFile);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const { edges, missingTargets, issues } = graphEdgesFromFiles(
    scanResult.files.filter((file) => !file.isReserved),
    nodeIds,
  );
  const backlinks = backlinksFromEdges(edges);
  const backlinksPath = path.join(workspaceRoot, ".okfh/backlinks.json");
  const htmlPath = path.join(workspaceRoot, ".okfh/reports/graph.html");
  const data: GraphBacklinksData = {
    generatedAt: (options.now ?? new Date()).toISOString(),
    workspaceRoot,
    nodes,
    edges,
    backlinks,
    issues,
    missingTargets,
  };

  try {
    await mkdir(path.dirname(backlinksPath), { recursive: true });
    await mkdir(path.dirname(htmlPath), { recursive: true });
    await writeFile(backlinksPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await writeFile(htmlPath, renderGraphHtml(data), "utf8");
  } catch (error) {
    throw new GraphWorkspaceError(
      error instanceof Error ? error.message : "Could not write graph artifacts.",
      GRAPH_WRITE_FAILED,
      { backlinksPath, htmlPath },
    );
  }

  return {
    workspaceRoot,
    report: {
      backlinksPath,
      htmlPath,
    },
    stats: {
      nodes: nodes.length,
      conceptEdges: edges.filter((edge) => edge.kind === "link").length,
      evidenceEdges: edges.filter((edge) => edge.kind === "citation").length,
      missingTargets: missingTargets.length,
    },
    issues,
    missingTargets,
  };
}

function graphNodeFromFile(file: OkfMarkdownFile): GraphNode {
  const document = okfDocumentView(file);
  return {
    id: file.conceptId,
    path: file.workspacePath,
    title: document.title,
    type: document.type ?? "Unknown",
    tags: document.tags,
  };
}

function graphEdgesFromFiles(
  files: OkfMarkdownFile[],
  nodeIds: Set<string>,
): { edges: GraphEdge[]; missingTargets: MissingGraphTarget[]; issues: GraphIssue[] } {
  const edges = new Map<string, GraphEdge>();
  const missingTargets: MissingGraphTarget[] = [];
  const issues: GraphIssue[] = [];

  for (const file of files) {
    const body = okfDocumentView(file).body;
    const targets = [
      ...parseMarkdownLinks(body).map((link) => ({ target: link.target, kind: "link" as const })),
      ...parseBareReferenceTargets(body).map((reference) => ({
        target: reference.target,
        kind: "citation" as const,
      })),
    ];

    for (const target of targets) {
      const conceptId = resolveOkfLinkTarget(target.target, file.bundlePath);
      if (conceptId === undefined) {
        continue;
      }
      if (!nodeIds.has(conceptId)) {
        missingTargets.push({
          from: file.conceptId,
          target: target.target,
          path: file.workspacePath,
        });
        issues.push({
          code: "MISSING_TARGET",
          path: file.workspacePath,
          message: `Graph link target does not exist: ${target.target}`,
        });
        continue;
      }
      if (conceptId === file.conceptId) {
        continue;
      }
      const edge: GraphEdge = {
        from: file.conceptId,
        to: conceptId,
        kind: target.kind,
      };
      edges.set(`${edge.from}\0${edge.to}\0${edge.kind}`, edge);
    }
  }

  return {
    edges: [...edges.values()].sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to) ||
        left.kind.localeCompare(right.kind),
    ),
    missingTargets,
    issues,
  };
}

function backlinksFromEdges(edges: GraphEdge[]): Record<string, string[]> {
  const backlinks: Record<string, string[]> = {};
  for (const edge of edges) {
    backlinks[edge.to] = [...(backlinks[edge.to] ?? []), edge.from].sort();
  }
  return backlinks;
}

function renderGraphHtml(data: GraphBacklinksData): string {
  const safeJson = JSON.stringify({
    nodes: data.nodes,
    edges: data.edges,
    issues: data.issues,
    missingTargets: data.missingTargets,
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OKF Harness Graph</title>
<style>
body { margin: 0; font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172026; background: #f7f8f5; }
header { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid #d8ddd2; background: #ffffff; }
h1 { font-size: 16px; margin: 0; }
input, select { font: inherit; padding: 6px 8px; border: 1px solid #bac3b4; border-radius: 6px; background: #fff; }
main { display: grid; grid-template-columns: minmax(0, 1fr) 320px; min-height: calc(100vh - 58px); }
svg { width: 100%; height: calc(100vh - 58px); background: #f7f8f5; }
aside { border-left: 1px solid #d8ddd2; padding: 16px; background: #ffffff; overflow: auto; }
.node { cursor: pointer; }
.edge { stroke: #83907b; stroke-width: 1.4; opacity: .75; }
.node circle { fill: #2f6f73; stroke: #fff; stroke-width: 2; }
.node.reference circle { fill: #8b5e34; }
.node text { paint-order: stroke; stroke: #f7f8f5; stroke-width: 4; fill: #172026; font-size: 12px; }
.muted { color: #667064; }
@media (max-width: 760px) { main { grid-template-columns: 1fr; } aside { border-left: 0; border-top: 1px solid #d8ddd2; } svg { height: 62vh; } }
</style>
</head>
<body>
<header>
<h1>OKF Harness Graph</h1>
<input id="search" type="search" placeholder="Search nodes" aria-label="Search nodes">
<select id="type" aria-label="Filter by type"><option value="">All types</option></select>
</header>
<main>
<svg id="graph" role="img" aria-label="OKF concept graph"></svg>
<aside id="details"><p class="muted">Select a node to inspect links and metadata.</p></aside>
</main>
<script>
const graph = ${safeJson};
const svg = document.querySelector("#graph");
const details = document.querySelector("#details");
const search = document.querySelector("#search");
const type = document.querySelector("#type");
const types = [...new Set(graph.nodes.map((node) => node.type))].sort();
for (const item of types) {
  const option = document.createElement("option");
  option.value = item;
  option.textContent = item;
  type.appendChild(option);
}
function visibleNodes() {
  const q = search.value.trim().toLowerCase();
  return graph.nodes.filter((node) => {
    const matchesType = !type.value || node.type === type.value;
    const haystack = [node.id, node.title, node.path, node.type].join(" ").toLowerCase();
    return matchesType && (!q || haystack.includes(q));
  });
}
function render() {
  const nodes = visibleNodes();
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const width = svg.clientWidth || 900;
  const height = svg.clientHeight || 620;
  const radius = Math.max(120, Math.min(width, height) * 0.34);
  const cx = width / 2;
  const cy = height / 2;
  const positioned = nodes.map((node, index) => {
    const angle = nodes.length <= 1 ? 0 : (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    return { ...node, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
  const byId = new Map(positioned.map((node) => [node.id, node]));
  svg.replaceChildren();
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "edge");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    svg.appendChild(line);
  }
  for (const node of positioned) {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "node " + node.type.toLowerCase());
    group.addEventListener("click", () => showDetails(node));
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", node.x);
    circle.setAttribute("cy", node.y);
    circle.setAttribute("r", "18");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", node.x + 24);
    label.setAttribute("y", node.y + 4);
    label.textContent = node.title;
    group.append(circle, label);
    svg.appendChild(group);
  }
}
function showDetails(node) {
  const outgoing = graph.edges.filter((edge) => edge.from === node.id);
  const incoming = graph.edges.filter((edge) => edge.to === node.id);
  details.innerHTML = [
    "<h2>" + escapeHtml(node.title) + "</h2>",
    "<p><strong>Path:</strong> " + escapeHtml(node.path) + "</p>",
    "<p><strong>Type:</strong> " + escapeHtml(node.type) + "</p>",
    "<p><strong>Tags:</strong> " + escapeHtml(node.tags.join(", ")) + "</p>",
    "<h3>Outgoing</h3>",
    listEdges(outgoing, "to"),
    "<h3>Backlinks</h3>",
    listEdges(incoming, "from")
  ].join("");
}
function listEdges(edges, key) {
  if (edges.length === 0) return '<p class="muted">None</p>';
  return "<ul>" + edges.map((edge) => "<li>" + escapeHtml(edge[key]) + " <span class=\\"muted\\">" + edge.kind + "</span></li>").join("") + "</ul>";
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
search.addEventListener("input", render);
type.addEventListener("change", render);
addEventListener("resize", render);
render();
</script>
</body>
</html>
`;
}
