#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildEnvironment, runTypecheckProjects } from "./run-build.mjs";
import { buildTypecheckSlices, writeTypecheckProjects } from "./typecheck-slices.mjs";

export function runTypecheck({
  spawn = spawnSync,
  env = process.env,
  projects,
  writeProjects = writeTypecheckProjects,
} = {}) {
  const prepared = buildEnvironment(env);
  const generated = projects == null;
  const typecheckProjects = projects ?? writeProjects();
  const sliceNames = generated && writeProjects === writeTypecheckProjects
    ? buildTypecheckSlices().map((slice) => slice.name)
    : [];
  return runTypecheckProjects({
    spawn,
    projects: typecheckProjects,
    env: prepared,
    sliceNames,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runTypecheck();
}
