import fs from "node:fs";
import path from "node:path";

// One tsc project peaks above 8 GiB RSS. Each slice is its own program with the
// same compiler options. Files are walked, then packed into area bins so a new
// directory is checked without editing this file. Caps are source-file counts
// from groups that stayed near 2.6 to 3.2 GiB; larger mixes reached 5 GiB.
export const typecheckExcludes = [
  "node_modules",
  ".next",
  "storybook-static",
  "examples",
  "scripts/checks/ui-consistency/fixtures",
];

// Matcher types are not a declaration file, so this one include stays named.
// Every .d.ts the walk finds is also included in every slice and kept out of
// the bins. A new global declaration file needs no edit here.
export const typecheckNamedSharedInclude = "tests/config/vitest.setup.ts";

const workspaceRoot = "app/(regional)/app/(workspace)/";
const projectRoot = `${workspaceRoot}[project]/`;
const regionalRoot = "app/(regional)/";

// Whole-area runs of app, scripts, and the repo remainder stayed under 2.8 GiB.
const areaRules = [
  { name: "lib", cap: 1200 },
  { name: "components", cap: 150 },
  { name: "workspace-pages", cap: 60 },
  { name: "workspace-shell", cap: 100000 },
  { name: "regional", cap: 22 },
  { name: "app", cap: 500 },
  { name: "scripts", cap: 500 },
  { name: "repo", cap: 400 },
];

function matchesEntry(file, entry) {
  return file === entry || file.startsWith(`${entry}/`);
}

export function isExcludedTypecheckPath(file) {
  return typecheckExcludes.some((entry) => matchesEntry(file, entry));
}

export function listTypecheckSourceFiles(root = process.cwd()) {
  const files = [];
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory)) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      // tsc globs do not match directories whose names start with ".".
      if (name.startsWith(".") || isExcludedTypecheckPath(relative)) continue;
      if (fs.statSync(absolute).isDirectory()) walk(absolute);
      else if (relative.endsWith(".ts") || relative.endsWith(".tsx")) files.push(relative);
    }
  };
  walk(root);
  return files.sort();
}

function isWorkspacePage(file) {
  return file.startsWith(projectRoot) && file.slice(projectRoot.length).includes("/");
}

function areaOf(file) {
  if (file.startsWith(workspaceRoot)) {
    return isWorkspacePage(file) ? "workspace-pages" : "workspace-shell";
  }
  if (file.startsWith(regionalRoot)) return "regional";
  if (file.startsWith("app/")) return "app";
  if (file.startsWith("lib/")) return "lib";
  if (file.startsWith("components/")) return "components";
  if (file.startsWith("scripts/")) return "scripts";
  return "repo";
}

function unitPath(area, file) {
  if (area === "workspace-shell") {
    const rest = file.slice(workspaceRoot.length);
    const [head, ...tail] = rest.split("/");
    return tail.length > 0 && head !== "[project]" ? `${workspaceRoot}${head}` : file;
  }
  if (area === "workspace-pages") return projectRoot + file.slice(projectRoot.length).split("/")[0];
  if (area === "regional") {
    const parts = file.slice(regionalRoot.length).split("/");
    if (parts.length === 1) return file;
    if (parts[0] === "app") {
      return parts.length === 2 ? file : `${regionalRoot}app/${parts[1]}`;
    }
    return regionalRoot + parts[0];
  }
  const prefix = {
    lib: "lib/",
    components: "components/",
    app: "app/",
    scripts: "scripts/",
  }[area];
  if (!prefix) {
    const [head, ...tail] = file.split("/");
    return tail.length === 0 ? file : head;
  }
  const parts = file.slice(prefix.length).split("/");
  return parts.length === 1 ? file : prefix + parts[0];
}

function patternsFor(entry) {
  if (entry.endsWith(".ts") || entry.endsWith(".tsx")) return [entry];
  return [`${entry}/**/*.ts`, `${entry}/**/*.tsx`];
}

function packUnits(units, cap) {
  const bins = [];
  let current = [];
  let count = 0;
  for (const unit of units) {
    if (current.length > 0 && count + unit.files.length > cap) {
      bins.push(current);
      current = [];
      count = 0;
    }
    current.push(unit);
    count += unit.files.length;
  }
  if (current.length > 0) bins.push(current);
  return bins;
}

export function sharedTypecheckFiles(root = process.cwd(), files = listTypecheckSourceFiles(root)) {
  return [typecheckNamedSharedInclude, ...files.filter((file) => file.endsWith(".d.ts"))];
}

export function buildTypecheckSlices(root = process.cwd()) {
  const files = listTypecheckSourceFiles(root);
  const shared = new Set(sharedTypecheckFiles(root, files));
  const byKey = new Map();
  const add = (area, unit, file, extra) => {
    const key = `${area}\0${unit}`;
    const entry = byKey.get(key) ?? { area, path: unit, files: [], extra: [] };
    entry.files.push(file);
    if (extra && !entry.extra.includes(extra)) entry.extra.push(extra);
    byKey.set(key, entry);
  };
  for (const file of files) {
    if (shared.has(file)) continue;
    // Declares onboarding_entered for the integrations analytics tests.
    if (matchesEntry(file, "components/analytics")) {
      add("lib", "lib/integrations", file, "components/analytics");
      continue;
    }
    const area = areaOf(file);
    add(area, unitPath(area, file), file);
  }
  const slices = [];
  for (const rule of areaRules) {
    const units = [...byKey.values()]
      .filter((unit) => unit.area === rule.name)
      .sort((left, right) => left.path.localeCompare(right.path));
    const bins = packUnits(units, rule.cap);
    bins.forEach((bin, index) => {
      const paths = [...new Set(bin.flatMap((unit) => [unit.path, ...unit.extra]))];
      slices.push({
        name: `${rule.name}-${index + 1}`,
        paths,
        files: bin.flatMap((unit) => unit.files),
      });
    });
  }
  return slices;
}

const configPrefix = "../../../";
const nextAmbientFileName = "next-ambient.d.ts";
const nextAmbientSource = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`;

export function nextAmbientInclude() {
  return path.posix.join(
    configPrefix,
    "node_modules/.cache/ci-typecheck",
    nextAmbientFileName,
  );
}

export function includePatternsFor(slice, root = process.cwd()) {
  return [
    ...sharedTypecheckFiles(root),
    ...slice.paths.flatMap((entry) => patternsFor(entry)),
  ];
}

export function excludePatternsFor() {
  return [...typecheckExcludes];
}

function toConfigPattern(entry) {
  return path.posix.join(configPrefix, entry);
}

export function writeTypecheckProjects(root = process.cwd()) {
  const directory = path.join(root, "node_modules", ".cache", "ci-typecheck");
  fs.mkdirSync(directory, { recursive: true });
  // Same Next ambient references as next-env.d.ts. The .next/types imports stay
  // in that file, which the walk picks up only after it exists.
  fs.writeFileSync(path.join(directory, nextAmbientFileName), nextAmbientSource);
  return buildTypecheckSlices(root).map((slice) => {
    const config = {
      extends: path.posix.join(configPrefix, "tsconfig.json"),
      compilerOptions: { incremental: false },
      // `exclude` drops anything under node_modules, including this cache file.
      // `files` is not filtered by `exclude`.
      files: [nextAmbientInclude()],
      include: includePatternsFor(slice, root).map(toConfigPattern),
      exclude: excludePatternsFor().map(toConfigPattern),
    };
    const configPath = path.join(directory, `tsconfig.${slice.name}.json`);
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    return path.relative(root, configPath);
  });
}

export function typecheckPartitionErrors(root = process.cwd()) {
  const owners = new Map();
  for (const slice of buildTypecheckSlices(root)) {
    for (const file of slice.files) {
      const names = owners.get(file) ?? [];
      names.push(slice.name);
      owners.set(file, names);
    }
  }
  const uncovered = [];
  const duplicates = [];
  const shared = new Set(sharedTypecheckFiles(root));
  for (const file of listTypecheckSourceFiles(root)) {
    if (shared.has(file)) continue;
    const names = owners.get(file) ?? [];
    if (names.length > 1) duplicates.push(file);
    else if (names.length === 0) uncovered.push(file);
  }
  return { uncovered, duplicates };
}
