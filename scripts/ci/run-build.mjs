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
  const prepared = buildEnvironment(env);
  delete prepared.NEXT_TYPES_CHECKED_BEFORE_BUILD;
  // Generate Prisma and Next's route types before checking with one native checker.
  // This keeps the full check out of Next's compiled-app heap on 8 GB runners.
  const steps = [
    [command, ["run", "prebuild"], prepared],
    [process.execPath, ["node_modules/next/dist/bin/next", "typegen"], prepared],
    [process.execPath, ["node_modules/typescript/lib/tsc.js", "--noEmit", "--checkers", "1"], prepared],
    [command, ["run", "build", "--", "--webpack"], { ...prepared, NEXT_TYPES_CHECKED_BEFORE_BUILD: "1" }],
  ];
  for (const [executable, args, childEnv] of steps) {
    const result = spawn(executable, args, { env: childEnv, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runBuild();
}
