#!/usr/bin/env node
import { fileURLToPath } from "node:url";

function parseNames(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

export function verifyRequiredJobs({
  allowAllSkipped = false,
  needsJson,
  optionalJobs = "",
}) {
  let needs;
  try {
    needs = JSON.parse(needsJson);
  } catch {
    throw new Error("NEEDS_JSON must be valid JSON.");
  }
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
    throw new Error("NEEDS_JSON must contain the GitHub Actions needs object.");
  }

  const entries = Object.entries(needs);
  if (entries.length === 0) throw new Error("At least one required job is expected.");
  const optional = parseNames(optionalJobs);
  for (const name of optional) {
    if (!(name in needs)) throw new Error(`Optional job is not in needs: ${name}`);
  }

  if (allowAllSkipped) {
    for (const [name, value] of entries) {
      if (value?.result !== "skipped") {
        throw new Error(`Draft pipeline job ${name} must be skipped, got ${value?.result}.`);
      }
    }
    return;
  }

  for (const [name, value] of entries) {
    const result = value?.result;
    if (result === "success") continue;
    if (result === "skipped" && optional.has(name)) continue;
    throw new Error(`Required job ${name} must succeed, got ${result ?? "missing"}.`);
  }
}

function main() {
  try {
    verifyRequiredJobs({
      allowAllSkipped: process.env.ALLOW_ALL_SKIPPED === "true",
      needsJson: process.env.NEEDS_JSON ?? "",
      optionalJobs: process.env.OPTIONAL_JOBS ?? "",
    });
    console.log("Required CI jobs passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
