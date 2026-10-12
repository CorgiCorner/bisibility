#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyPinnedNodeOptions } from "./node-memory-limit.mjs";

export function buildNodeOptions(current = "") {
  return applyPinnedNodeOptions(current);
}

export function buildEnvironment(current = {}) {
  return {
    ...current,
    NODE_OPTIONS: buildNodeOptions(current.NODE_OPTIONS),
    // TypeScript 7 runs in Go and does not observe the Node heap ceiling.
    // The cold project peaks near 6 GiB; a lower Go target doubles GC CPU.
    // Keep room for the parent and OS on the standard 8 GB runner.
    GOMEMLIMIT: "6GiB",
    GOMAXPROCS: "2",
  };
}

export function runBuild({ spawn = spawnSync, env = process.env, platform = process.platform } = {}) {
  const command = platform === "win32" ? "npm.cmd" : "npm";
  // The webpack worker exits before native type checking. Turbopack retains
  // its worker through that phase, overlapping both heaps on 8 GB runners.
  const result = spawn(command, ["run", "build", "--", "--webpack"], {
    env: buildEnvironment(env),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runBuild();
}
