import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../..");
const outputPath = path.join(rootDir, "DEPENDENCY_LICENSES.md");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function packagePathParts(packageName) {
  return packageName.split("/");
}

async function resolvePackageJson(packageName, fromDir) {
  const parts = packagePathParts(packageName);
  const tried = new Set();
  let current = fromDir;

  while (true) {
    const candidates = [path.join(current, "node_modules", ...parts, "package.json")];
    if (path.basename(current) === "node_modules") {
      candidates.unshift(path.join(current, ...parts, "package.json"));
    }

    for (const candidate of candidates) {
      if (!tried.has(candidate) && (await pathExists(candidate))) {
        return candidate;
      }
      tried.add(candidate);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function dependencyEntries(manifest) {
  const dependencies = Object.keys(manifest.dependencies ?? {}).map((name) => ({
    name,
    optional: false,
  }));
  const optionalDependencies = Object.keys(manifest.optionalDependencies ?? {}).map((name) => ({
    name,
    optional: true,
  }));

  return [...dependencies, ...optionalDependencies];
}

function manifestLicenseValue(manifest) {
  if (typeof manifest.license === "string" && manifest.license.trim()) {
    return manifest.license.trim();
  }
  if (manifest.license?.type) {
    return String(manifest.license.type);
  }
  if (Array.isArray(manifest.licenses) && manifest.licenses.length > 0) {
    return manifest.licenses
      .map((license) => (typeof license === "string" ? license : license?.type))
      .filter(Boolean)
      .join(", ");
  }

  return null;
}

function licenseFromText(text) {
  const normalized = text.slice(0, 6000).toLowerCase();
  if (normalized.includes("apache license") && normalized.includes("version 2.0")) {
    return "Apache-2.0";
  }
  if (normalized.includes("mit license") || normalized.includes("the mit license")) {
    return "MIT";
  }
  if (normalized.includes("bsd 3-clause")) {
    return "BSD-3-Clause";
  }
  if (normalized.includes("bsd 2-clause")) {
    return "BSD-2-Clause";
  }
  if (normalized.includes("gnu lesser general public license")) {
    return "LGPL";
  }
  if (normalized.includes("gnu general public license")) {
    return "GPL";
  }
  if (normalized.includes("mozilla public license")) {
    return "MPL";
  }
  if (normalized.includes("isc license")) {
    return "ISC";
  }
  if (normalized.includes("unlicense") || normalized.includes("public domain")) {
    return "Unlicense";
  }

  return null;
}

async function licenseFileValue(packageDir) {
  const entries = await fs.readdir(packageDir).catch(() => []);
  const licenseFile = entries.find((entry) => /^(licen[cs]e|copying|unlicense)(\.|$)/i.test(entry));
  if (!licenseFile) {
    return null;
  }
  const text = await fs.readFile(path.join(packageDir, licenseFile), "utf8").catch(() => "");
  return licenseFromText(text) ?? `SEE ${licenseFile}`;
}

function repositoryLicenseHint(manifest) {
  const source = repositoryValue(manifest).toLowerCase();
  if (source.includes("github.com/streamich/unionfs")) {
    return "Unlicense";
  }
  if (source.includes("github.com/better-auth/") || source.includes("github.com/better-fetch/")) {
    return "MIT";
  }

  return null;
}

async function licenseValue(manifest, packageDir) {
  return (
    manifestLicenseValue(manifest) ??
    (await licenseFileValue(packageDir)) ??
    repositoryLicenseHint(manifest) ??
    "UNKNOWN"
  );
}

function repositoryValue(manifest) {
  if (typeof manifest.repository === "string" && manifest.repository.trim()) {
    return manifest.repository.trim();
  }
  if (manifest.repository?.url) {
    return String(manifest.repository.url);
  }
  if (typeof manifest.homepage === "string" && manifest.homepage.trim()) {
    return manifest.homepage.trim();
  }

  return `https://www.npmjs.com/package/${manifest.name}`;
}

function markdownCell(value) {
  return String(value).replaceAll("|", String.raw`\|`).replaceAll("\n", " ");
}

async function collectProductionLicenses(rootManifest) {
  const rootDependencies = new Set(Object.keys(rootManifest.dependencies ?? {}));
  const queue = [...rootDependencies].map((name) => ({
    direct: true,
    fromDir: rootDir,
    name,
    optional: false,
  }));
  const seenPaths = new Set();
  const records = new Map();

  while (queue.length > 0) {
    const item = queue.shift();
    const packageJsonPath = await resolvePackageJson(item.name, item.fromDir);
    if (!packageJsonPath) {
      if (item.optional) {
        continue;
      }
      throw new Error(`Missing installed production dependency: ${item.name}`);
    }
    if (seenPaths.has(packageJsonPath)) {
      continue;
    }
    seenPaths.add(packageJsonPath);

    const manifest = await readJson(packageJsonPath);
    const packageDir = path.dirname(packageJsonPath);
    const name = manifest.name ?? item.name;
    const version = manifest.version ?? "UNKNOWN";
    const key = `${name}@${version}`;
    const existing = records.get(key);

    records.set(key, {
      direct: Boolean(existing?.direct || item.direct),
      license: await licenseValue(manifest, packageDir),
      name,
      source: repositoryValue(manifest),
      version,
    });

    for (const dependency of dependencyEntries(manifest)) {
      queue.push({
        direct: false,
        fromDir: packageDir,
        name: dependency.name,
        optional: dependency.optional,
      });
    }
  }

  return [...records.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || String(left.version).localeCompare(String(right.version)),
  );
}

function renderReport(rootManifest, records) {
  const rootDependencyCount = Object.keys(rootManifest.dependencies ?? {}).length;
  const lines = [
    "# Dependency Licenses",
    "",
    "Generated by `npm run licenses:generate` from installed `node_modules` package manifests.",
    "This report includes root production dependencies and installed transitive runtime dependencies.",
    "Optional dependencies that are not installed on this platform are skipped.",
    "",
    `Root production dependencies: ${rootDependencyCount}`,
    `Installed packages listed: ${records.length}`,
    "",
    "| Package | Version | Scope | License | Source |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const record of records) {
    lines.push(
      `| \`${markdownCell(record.name)}\` | ${markdownCell(record.version)} | ${
        record.direct ? "direct" : "transitive"
      } | ${markdownCell(record.license)} | ${markdownCell(record.source)} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

const rootManifest = await readJson(path.join(rootDir, "package.json"));
const records = await collectProductionLicenses(rootManifest);
await fs.writeFile(outputPath, renderReport(rootManifest, records));
console.log(`Wrote ${path.relative(rootDir, outputPath)} with ${records.length} packages.`);
