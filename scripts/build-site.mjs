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
const requiredRedirects = new Map([
  ["/install.sh", "https://github.com/pumblus/okf-harness/releases/latest/download/install.sh"],
  ["/install.ps1", "https://github.com/pumblus/okf-harness/releases/latest/download/install.ps1"],
]);

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

  const redirectEntries = new Map(
    redirects
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(/\s+/))
      .map(([source, destination]) => [source, destination]),
  );

  const missingRedirects = [...requiredRedirects].filter(([source, destination]) => {
    return redirectEntries.get(source) !== destination;
  });
  if (missingRedirects.length > 0) {
    fail(
      `site redirects are missing required installer entries: ${missingRedirects
        .map(([source]) => source)
        .join(", ")}`,
    );
  }

  console.log("site output is valid.");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
