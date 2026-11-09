#!/usr/bin/env node
/** Keeps hosted commercial values out of public docs and optional environment templates. */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { RESOURCE_LIMIT_KEYS } from "../contracts/hosted-limits.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");

const DEFAULT_CANONICAL = path.join(root, "docs/deployment-options.mdx");
const DEFAULT_DOCS_ROOT = path.join(root, "docs");
const DEFAULT_ENV_FILES = [path.join(root, ".env.example")];

function escapeRegex(str) {
  return str.replaceAll(/[$()*+.?[\\\]{}^|]/g, "\\$&");
}

// Reject commercial defaults without treating ordinary self-host examples as plans.
const COMMERCIAL_CLAIMS = [
  /\b1,?000\s+keywords?\s+per\s+project\b/i,
  /\b3\s+(?:owned\s+)?projects?\s+per\s+user\b/i,
  /\b(?:hosted|cloud|solo|pro|agency)\b[^\n]*\b\d[\d,.]*\s+(?:scheduled\s+|tracked\s+|owned\s+)?(?:projects?|keywords?|seats?)\b/i,
];

function readDocPages(docsRoot) {
  const pages = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".mdx")) {
        pages.push(full);
      }
    }
  }
  walk(docsRoot);
  return pages;
}

function checkEnvFiles(envFiles) {
  const errors = [];
  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const key of RESOURCE_LIMIT_KEYS) {
      const defaults = new RegExp(`${escapeRegex(key)}[^\\n]*[=:]\\s*[\\x60\\x22]?([1-9][0-9,]*)`, "i");
      if (defaults.test(content)) errors.push(`${path.relative(root, file)} contains a commercial default for ${key}.`);
    }
  }

  return errors;
}

export function check({
  docsRoot = DEFAULT_DOCS_ROOT,
  canonicalPage = DEFAULT_CANONICAL,
  envFiles = DEFAULT_ENV_FILES,
} = {}) {
  const errors = [];

  const canonicalContent = readFileSync(canonicalPage, "utf8");
  if (!canonicalContent.includes("https://bisibility.com/pricing")) errors.push("Canonical page must link to pricing.");
  if (!/Unset or [`]?0[`]? means unlimited/.test(canonicalContent)) errors.push("Canonical page must explain unlimited self-host defaults.");
  for (const page of readDocPages(docsRoot)) {
    const content = readFileSync(page, "utf8");
    if (COMMERCIAL_CLAIMS.some((pattern) => pattern.test(content))) {
      errors.push(`${path.relative(root, page)} contains hosted commercial limits; link to pricing instead.`);
    }
  }

  errors.push(...checkEnvFiles(envFiles));

  return errors;
}

function repoRelativePath(value, flag) {
  if (!value || path.isAbsolute(value)) {
    throw new Error(`${flag} requires a repo-relative path.`);
  }
  const resolved = path.resolve(root, value);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${flag} requires a repo-relative path inside the repository.`);
  }
  return resolved;
}

export function envFilesFromArgs(args) {
  const envFiles = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--env-file") continue;
    envFiles.push(repoRelativePath(args[index + 1], "--env-file"));
    index += 1;
  }
  return envFiles.length > 0 ? envFiles : DEFAULT_ENV_FILES;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = check({ envFiles: envFilesFromArgs(process.argv.slice(2)) });
  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exitCode = 1;
  } else {
    console.log("Hosted limits docs contract is current.");
  }
}
