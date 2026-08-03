#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyPinnedNodeOptions } from "./node-memory-limit.mjs";

export function buildNodeOptions(current = "") {
  return applyPinnedNodeOptions(current);
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
