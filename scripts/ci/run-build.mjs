#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const defaultHeapOption = "--max-old-space-size=4096";
const heapOptionPattern = /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)\d+(?=\s|$)/;

export function buildNodeOptions(current = "") {
  const normalized = current.trim();
  if (heapOptionPattern.test(normalized)) return normalized;
  return [normalized, defaultHeapOption].filter(Boolean).join(" ");
}

export function runBuild() {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["run", "build"], {
    env: {
      ...process.env,
      NODE_OPTIONS: buildNodeOptions(process.env.NODE_OPTIONS),
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runBuild();
}
