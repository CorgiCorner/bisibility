#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const docsRoot = join(root, "docs");
const config = JSON.parse(readFileSync(join(root, "scripts/checks/docs-terms.json"), "utf8"));

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(docsRoot).filter((file) => {
  if (![".md", ".mdx"].includes(extname(file))) return false;
  const rel = relative(docsRoot, file);
  return !rel.startsWith("plans/") && !rel.startsWith("private/");
});
const failures = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const label = relative(root, file);
  for (const rule of config.forbidden) {
    if (source.toLowerCase().includes(rule.pattern)) {
      failures.push(`${label}: ${rule.message} ("${rule.pattern}")`);
    }
  }
  if (/!\[\]\(/.test(source)) {
    failures.push(`${label}: images need alt text`);
  }
  if (/\]\(\s*#?\s*\)/.test(source) === false && /\[click here\]/i.test(source)) {
    failures.push(`${label}: descriptive links required`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Docs terminology and source a11y checks passed across ${files.length} pages.`);
