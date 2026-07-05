#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const siteSourceDir = path.join(repoRoot, "site", "src");
const siteOutputDir = path.join(repoRoot, "site", "dist");
const packagePath = path.join(repoRoot, "package.json");
const htmlOutputPath = path.join(siteOutputDir, "index.html");
const redirectsOutputPath = path.join(siteOutputDir, "_redirects");
const requiredRedirects = [
  {
    source: "/install.sh",
    destination: "https://github.com/pumblus/okf-harness/releases/latest/download/install.sh",
    status: "302",
  },
  {
    source: "/install.ps1",
    destination: "https://github.com/pumblus/okf-harness/releases/latest/download/install.ps1",
    status: "302",
  },
  {
    source: "/docs",
    destination: "https://github.com/pumblus/okf-harness/tree/main/docs",
    status: "302",
  },
  {
    source: "/docs/*",
    destination: "https://github.com/pumblus/okf-harness/blob/main/docs/:splat",
    status: "302",
  },
  {
    source: "/llms.txt",
    destination: "https://raw.githubusercontent.com/pumblus/okf-harness/main/llms.txt",
    status: "302",
  },
  {
    source: "/llms-full.txt",
    destination: "https://raw.githubusercontent.com/pumblus/okf-harness/main/llms-full.txt",
    status: "302",
  },
];

await buildSite();

if (process.argv.includes("--check")) {
  await checkSite();
}

async function buildSite() {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const template = await readFile(path.join(siteSourceDir, "index.html"), "utf8");
  const redirects = await readFile(path.join(siteSourceDir, "_redirects"), "utf8");
  const html = template.replaceAll("{{PACKAGE_VERSION}}", packageJson.version);

  await mkdir(siteOutputDir, { recursive: true });
  await writeFile(htmlOutputPath, html);
  await writeFile(redirectsOutputPath, redirects);
  console.log(`wrote ${path.relative(repoRoot, siteOutputDir)}`);
}

async function checkSite() {
  const html = await readFile(htmlOutputPath, "utf8");
  const redirects = await readFile(redirectsOutputPath, "utf8");
  const unresolvedPlaceholders = html.match(/{{[^{}]+}}/g);
  if (unresolvedPlaceholders) {
    fail(`site HTML has unresolved placeholders: ${unresolvedPlaceholders.join(", ")}`);
  }

  const redirectEntries = redirects
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [source, destination, status] = line.split(/\s+/);
      return { source, destination, status };
    });
  const redirectEntriesBySource = new Map(redirectEntries.map((entry) => [entry.source, entry]));
  const requiredSources = new Set(requiredRedirects.map((entry) => entry.source));

  const missingRedirects = requiredRedirects.filter((expected) => {
    const actual = redirectEntriesBySource.get(expected.source);
    return actual?.destination !== expected.destination || actual?.status !== expected.status;
  });
  if (missingRedirects.length > 0) {
    fail(
      `site redirects are missing required route entries: ${missingRedirects
        .map((entry) => entry.source)
        .join(", ")}`,
    );
  }

  const extraRedirects = redirectEntries.filter((entry) => !requiredSources.has(entry.source));
  if (extraRedirects.length > 0) {
    fail(
      `site redirects include routes outside the public homepage contract: ${extraRedirects
        .map((entry) => entry.source)
        .join(", ")}`,
    );
  }

  console.log("site output is valid.");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
