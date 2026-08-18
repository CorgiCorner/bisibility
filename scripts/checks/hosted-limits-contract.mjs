#!/usr/bin/env node
/**
 * Hosted limits docs and env-template contract checker.
 *
 * Imports the same machine contract as production deployment and proves the
 * canonical docs page (`docs/deployment-options.mdx`) contains both current
 * hosted limit values. Rejects missing, wrong, or duplicated current values in
 * any other public docs page so the numbers stay in exactly one place.
 *
 * Also rejects current hosted commercial values reintroduced alongside the
 * limit variable names in the root and generated release environment
 * templates. Blank optional entries and mechanism-only comments do not trigger
 * false positives.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOSTED_LIMITS } from "../contracts/hosted-limits.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");

const DEFAULT_CANONICAL = path.join(root, "docs/deployment-options.mdx");
const DEFAULT_DOCS_ROOT = path.join(root, "docs");
const DEFAULT_ENV_FILES = [path.join(root, ".env.example")];

function escapeRegex(str) {
  return str.replaceAll(/[$()*+.?[\\\]{}^|]/g, "\\$&");
}

function commaFormat(value) {
  return value.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
}

/**
 * Build the canonical, duplication, and env-line regexes for each hosted limit.
 *
 * The canonical page must match the canonical regex. No other page may match
 * the duplication regex. Both use contextual phrases so common bare numbers
 * (e.g. "3" or "1000" in API docs) do not false-positive. The duplication
 * regex also catches the variable name on the same line as the value.
 *
 * The env-line regex matches a line that contains the limit variable name and
 * the raw contracted value on the same line. Blank optional entries and
 * mechanism-only comments (no value) do not match.
 */
const LIMIT_CHECKS = Object.entries(HOSTED_LIMITS).map(([key, value]) => {
  const comma = commaFormat(value);
  const escapedVar = escapeRegex(key);
  const escapedValue = escapeRegex(value);
  const escapedComma = escapeRegex(comma);

  let phrase;
  let varLine;
  if (key === "BISIBILITY_MAX_KEYWORDS_PER_PROJECT") {
    const numAlt = [escapedComma, escapedValue].join("|");
    phrase = `\\b(?:${numAlt})\\W+keywords?\\s+per\\s+project`;
    varLine = `${escapedVar}[^\\n]*\\b${escapedValue}\\b`;
  } else {
    phrase = `\\b${escapedValue}\\W+(?:owned\\s+)?projects?\\s+per\\s+user`;
    varLine = `${escapedVar}[^\\n]*\\b${escapedValue}\\b`;
  }

  const canonicalRegex = new RegExp(phrase, "i");
  const duplicationRegex = new RegExp(`${phrase}|${varLine}`, "i");
  const envLineRegex = new RegExp(varLine, "i");

  return { key, value, canonicalRegex, duplicationRegex, envLineRegex };
});

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
    for (const { key, value, envLineRegex } of LIMIT_CHECKS) {
      if (envLineRegex.test(content)) {
        const rel = path.relative(root, file);
        errors.push(
          `${rel} contains ${key} value ${value}; current hosted numbers belong only in docs/deployment-options.mdx.`,
        );
      }
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
  for (const { key, value, canonicalRegex } of LIMIT_CHECKS) {
    if (!canonicalRegex.test(canonicalContent)) {
      errors.push(`Canonical page missing ${key} value ${value}.`);
    }
  }

  const pages = readDocPages(docsRoot);
  for (const page of pages) {
    if (path.resolve(page) === path.resolve(canonicalPage)) continue;
    const content = readFileSync(page, "utf8");
    for (const { key, value, duplicationRegex } of LIMIT_CHECKS) {
      if (duplicationRegex.test(content)) {
        const rel = path.relative(root, page);
        errors.push(
          `${rel} contains ${key} value ${value}; current hosted numbers belong only in docs/deployment-options.mdx.`,
        );
      }
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
