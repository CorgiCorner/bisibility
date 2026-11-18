#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyPinnedNodeOptions } from "./node-memory-limit.mjs";
import { buildTypecheckSlices, writeTypecheckProjects } from "./typecheck-slices.mjs";

function runChild(spawn, executable, args, childEnv, label) {
  if (label) console.log(`typecheck ${label}`);
  const result = spawn(executable, args, { env: childEnv, stdio: "inherit" });
  if (result.error) throw result.error;
  return result;
}

export function buildNodeOptions(current = "") {
  return applyPinnedNodeOptions(current);
}

export function buildEnvironment(current = {}) {
  return {
    ...current,
    NODE_OPTIONS: buildNodeOptions(current.NODE_OPTIONS),
    // TypeScript 7 is a Go binary, so the Node heap cap does not apply.
    // A cold single check peaked at 8,717,402,112 bytes RSS (other cold runs
    // of this tree sat between 8.1 and 8.7 GiB). GOGC=20 stayed at
    // 8,457,338,880 and GOMEMLIMIT=4GiB stayed at 8,703,066,112 while using
    // more CPU, so the soft limit stays 6GiB. GOMAXPROCS=2 matches the runner.
    // The check is one generated project per slice. Three cold passes peaked
    // at 4,114,038,784, 4,040,523,776 and 4,156,801,024 bytes, all in
    // workspace-shell-1. Wall time was 410 s, 408 s and 412 s against the
    // 80 s single run.
    GOMEMLIMIT: "6GiB",
    GOMAXPROCS: "2",
  };
}

export function typecheckArguments(projectPath) {
  return [
    process.execPath,
    [
      "node_modules/typescript/lib/tsc.js",
      "--noEmit",
      "--checkers",
      "1",
      // CI starts cold and does not reuse incremental info. Dropping it on the
      // single check peaked at 8,400,093,184 bytes RSS, and each slice would
      // otherwise write a build-info file.
      "--incremental",
      "false",
      "-p",
      projectPath,
    ],
  ];
}

export function runTypecheckProjects({
  spawn,
  projects,
  env,
  sliceNames = [],
}) {
  let typecheckStatus = 0;
  for (let index = 0; index < projects.length; index += 1) {
    const [executable, args] = typecheckArguments(projects[index]);
    const result = runChild(spawn, executable, args, env, sliceNames[index]);
    if (result.status == null) return 1;
    if (result.status !== 0 && typecheckStatus === 0) typecheckStatus = result.status;
  }
  return typecheckStatus;
}

export function runBuild({
  spawn = spawnSync,
  env = process.env,
  platform = process.platform,
  projects,
  writeProjects = writeTypecheckProjects,
} = {}) {
  const command = platform === "win32" ? "npm.cmd" : "npm";
  const prepared = buildEnvironment(env);
  delete prepared.NEXT_TYPES_CHECKED_BEFORE_BUILD;
  const preparation = [
    [command, ["run", "prebuild"]],
    [process.execPath, ["node_modules/next/dist/bin/next", "typegen"]],
  ];
  for (const [executable, args] of preparation) {
    const result = runChild(spawn, executable, args, prepared);
    if (result.status == null) return 1;
    if (result.status !== 0) return result.status;
  }
  // prebuild and typegen create files the walk must see, including next-env.d.ts.
  const generated = projects == null;
  const typecheckProjects = projects ?? writeProjects();
  const sliceNames = generated && writeProjects === writeTypecheckProjects
    ? buildTypecheckSlices().map((slice) => slice.name)
    : [];
  const typecheckStatus = runTypecheckProjects({
    spawn,
    projects: typecheckProjects,
    env: prepared,
    sliceNames,
  });
  if (typecheckStatus !== 0) return typecheckStatus;
  const buildEnv = { ...prepared, NEXT_TYPES_CHECKED_BEFORE_BUILD: "1" };
  // Exit the compiler before loading the compiled app for static generation.
  // Managed adapters expect both outputs in a single build invocation.
  const split = !prepared.VERCEL && !prepared.AMPLIFY_HOSTING &&
    (prepared.NEXT_BUILD_MEMORY_CAPPED ||
      (prepared.GITHUB_ACTIONS === "true" && prepared.RUNNER_ENVIRONMENT === "github-hosted"));
  const builds = split
    ? ["compile", "generate"].map((mode) => [process.execPath, [
        "node_modules/next/dist/bin/next", "build", "--turbopack", "--experimental-build-mode", mode,
      ]])
    : [[command, ["run", "build", "--", "--turbopack"]]];
  if (split) Object.assign(buildEnv, { RAYON_NUM_THREADS: "2", TOKIO_WORKER_THREADS: "2" });
  for (const [executable, args] of builds) {
    const result = runChild(spawn, executable, args, buildEnv);
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runBuild();
}
