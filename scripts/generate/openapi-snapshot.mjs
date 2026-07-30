#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { load, resolve } from "../../lib/temporal/loader.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const snapshotPath = path.join(root, "docs/openapi.snapshot.json");
const lineWidth = 100;

process.chdir(root);
registerHooks({ load, resolve });

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortValue(item)]),
  );
}

async function snapshotJson() {
  const { getOpenApiDocument } = await import(pathToFileURL(path.join(root, "lib/api/openapi.ts")));
  return `${stringifyJson(sortValue(getOpenApiDocument()))}\n`;
}

function isPrimitive(value) {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}

function indent(level) {
  return " ".repeat(level);
}

function stringifyJson(value, level = 0, lineOffset = level) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    const compact = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
    if (
      value.every(isPrimitive) &&
      lineOffset + compact.length + 1 <= lineWidth &&
      compact.length <= 80
    ) {
      return compact;
    }

    return `[\n${value
      .map((item) => `${indent(level + 2)}${stringifyJson(item, level + 2)}`)
      .join(",\n")}\n${indent(level)}]`;
  }
  if (!value || typeof value !== "object") {
    return JSON.stringify(value);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }

  return `{\n${entries
    .map(([key, item]) => {
      const prefix = `${JSON.stringify(key)}: `;
      return `${indent(level + 2)}${prefix}${stringifyJson(
        item,
        level + 2,
        level + 2 + prefix.length,
      )}`;
    })
    .join(",\n")}\n${indent(level)}}`;
}

function diffSummary(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const maxLines = Math.max(expectedLines.length, actualLines.length);
  let first = 0;

  while (first < maxLines && expectedLines[first] === actualLines[first]) {
    first += 1;
  }

  const start = Math.max(0, first - 3);
  const end = Math.min(maxLines, first + 8);
  const format = (label, lines) => [
    label,
    ...lines.slice(start, end).map((line, index) => {
      const number = String(start + index + 1).padStart(5, " ");
      return `${number} | ${line ?? ""}`;
    }),
  ];

  return [
    "docs/openapi.snapshot.json is stale.",
    `First difference at line ${first + 1}.`,
    "",
    ...format("Generated:", expectedLines),
    "",
    ...format("Committed:", actualLines),
  ].join("\n");
}

async function main() {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");

  if (write === check) {
    console.error("Usage: node scripts/generate/openapi-snapshot.mjs --write|--check");
    process.exitCode = 2;
    return;
  }

  const generated = await snapshotJson();
  if (write) {
    await writeFile(snapshotPath, generated);
    console.log("Wrote docs/openapi.snapshot.json");
    return;
  }

  const committed = await readFile(snapshotPath, "utf8").catch(() => "");
  if (committed !== generated) {
    console.error(diffSummary(generated, committed));
    process.exitCode = 1;
    return;
  }

  console.log("docs/openapi.snapshot.json is current.");
}

await main();
