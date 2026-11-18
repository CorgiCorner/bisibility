import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildEnvironment, buildNodeOptions, runBuild, typecheckArguments } from "./run-build.mjs";
import { runTypecheck } from "./run-typecheck.mjs";
import {
  buildTypecheckSlices,
  listTypecheckSourceFiles,
  nextAmbientInclude,
  sharedTypecheckFiles,
  typecheckPartitionErrors,
  writeTypecheckProjects,
} from "./typecheck-slices.mjs";

test("adds a 4 GiB heap limit when the caller has not set one", () => {
  assert.equal(buildNodeOptions(""), "--max-old-space-size=4096");
  assert.equal(
    buildNodeOptions("--enable-source-maps"),
    "--enable-source-maps --max-old-space-size=4096",
  );
});

test("replaces caller heap limits with the pinned release ceiling", () => {
  assert.equal(
    buildNodeOptions("--max-old-space-size=6144"),
    "--max-old-space-size=4096",
  );
  assert.equal(buildNodeOptions("--max_old_space_size 5120"), "--max-old-space-size=4096");
  assert.equal(
    buildNodeOptions("--enable-source-maps --max-old-space-size=6144"),
    "--enable-source-maps --max-old-space-size=4096",
  );
});

test("bounds the native compiler without losing caller settings", () => {
  const current = {
    NODE_OPTIONS: "--enable-source-maps --max-old-space-size=6144",
    GOMEMLIMIT: "8GiB",
    GOMAXPROCS: "8",
    NEXT_DIST_DIR: ".next/build-fixture",
  };
  assert.deepEqual(buildEnvironment(current), {
    ...current,
    NODE_OPTIONS: "--enable-source-maps --max-old-space-size=4096",
    GOMEMLIMIT: "6GiB",
    GOMAXPROCS: "2",
  });
  assert.equal(current.GOMEMLIMIT, "8GiB");
  assert.equal(current.NODE_OPTIONS, "--enable-source-maps --max-old-space-size=6144");
});

test("typecheck slices cover each source file once", () => {
  const slices = buildTypecheckSlices();
  const projects = writeTypecheckProjects();
  assert.equal(projects.length, slices.length);
  const apiProject = projects.find((project) => {
    const include = JSON.parse(fs.readFileSync(project, "utf8")).include;
    return include.includes("../../../lib/api/**/*.ts");
  });
  const config = JSON.parse(fs.readFileSync(apiProject, "utf8"));
  assert.equal(config.extends, "../../../tsconfig.json");
  assert.equal(config.compilerOptions.incremental, false);
  const shared = sharedTypecheckFiles();
  assert.ok(shared.includes("tests/config/vitest.setup.ts"));
  assert.deepEqual(
    shared.filter((file) => file.endsWith(".d.ts")),
    listTypecheckSourceFiles().filter((file) => file.endsWith(".d.ts")),
  );
  for (const file of shared) assert.ok(config.include.includes(`../../../${file}`), file);
  assert.equal(slices.some((slice) => slice.files.some((file) => file.endsWith(".d.ts"))), false);
  assert.ok(config.exclude.includes("../../../node_modules"));
  assert.deepEqual(typecheckArguments(projects[0])[1].slice(0, 6), [
    "node_modules/typescript/lib/tsc.js",
    "--noEmit",
    "--checkers",
    "1",
    "--incremental",
    "false",
  ]);
  const { uncovered, duplicates } = typecheckPartitionErrors();
  assert.deepEqual(uncovered, []);
  assert.deepEqual(duplicates, []);
  const analytics = slices.find((slice) => slice.paths.includes("components/analytics"));
  const integrations = slices.find((slice) => slice.paths.includes("lib/integrations"));
  assert.equal(analytics, integrations);
});

test("a new directory lands in exactly one slice", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-typecheck-"));
  const files = [
    "lib/brand-new-widget/widget.ts",
    "components/brand-new/card.tsx",
    "app/(regional)/fresh-route/page.tsx",
    "app/brand-new-section/page.tsx",
    "scripts/brand-new/run.ts",
    "tests/brand-new/example.test.ts",
    "types/brand-new-ambient.d.ts",
  ];
  for (const file of files) {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, "export const value = 1;\n");
  }
  try {
    const declaration = "types/brand-new-ambient.d.ts";
    const slices = buildTypecheckSlices(root);
    for (const file of files) {
      if (file === declaration) continue;
      const owners = slices.filter((slice) => slice.files.includes(file));
      assert.equal(owners.length, 1, file);
      assert.equal(owners[0].files.filter((owned) => owned === file).length, 1);
    }
    assert.equal(slices.some((slice) => slice.files.includes(declaration)), false);
    assert.equal(slices.some((slice) => slice.paths.includes(declaration)), false);
    assert.ok(sharedTypecheckFiles(root).includes(declaration));
    const projects = writeTypecheckProjects(root);
    for (const project of projects) {
      const include = JSON.parse(fs.readFileSync(path.join(root, project), "utf8")).include;
      assert.ok(include.includes(`../../../${declaration}`));
    }
    const { uncovered, duplicates } = typecheckPartitionErrors(root);
    assert.deepEqual(uncovered, []);
    assert.deepEqual(duplicates, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("typecheck projects are written after next typegen", () => {
  const events = [];
  const result = runBuild({
    env: {},
    writeProjects: () => {
      events.push("write-projects");
      return ["slice.json"];
    },
    spawn: (_executable, args) => {
      events.push(args[0] === "run" ? args[1] : args[0]);
      return { status: 0 };
    },
  });
  assert.equal(result, 0);
  assert.deepEqual(events, [
    "prebuild",
    "node_modules/next/dist/bin/next",
    "write-projects",
    "node_modules/typescript/lib/tsc.js",
    "build",
  ]);
});

test("slices reference Next ambient types when next-env.d.ts is absent", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-typecheck-"));
  const source = path.join(root, "lib/widget.ts");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, "export const value = 1;\n");
  try {
    const projects = writeTypecheckProjects(root);
    const ambientPath = path.join(root, "node_modules/.cache/ci-typecheck/next-ambient.d.ts");
    const ambient = fs.readFileSync(ambientPath, "utf8");
    assert.match(ambient, /<reference types="next" \/>/);
    assert.match(ambient, /<reference types="next\/image-types\/global" \/>/);
    assert.equal(ambient.includes(".next/types"), false);
    assert.ok(projects.length > 0);
    for (const project of projects) {
      const config = JSON.parse(fs.readFileSync(path.join(root, project), "utf8"));
      assert.ok(config.files.includes(nextAmbientInclude()));
      assert.equal(config.include.some((entry) => entry.endsWith("next-env.d.ts")), false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checks generated types before building and preserves a failed build exit", () => {
  const projects = writeTypecheckProjects();
  for (const platform of ["linux", "win32"]) {
    const calls = [];
    const result = runBuild({
      platform,
      projects,
      env: { VERCEL: "1", NEXT_BUILD_MEMORY_CAPPED: "1" },
      spawn: (...args) => {
        calls.push(args);
        return { status: calls.length === projects.length + 3 ? 7 : 0 };
      },
    });
    assert.equal(result, 7);
    assert.equal(calls.length, projects.length + 3);
    assert.deepEqual(calls[0].slice(0, 2), [
      platform === "win32" ? "npm.cmd" : "npm", ["run", "prebuild"],
    ]);
    assert.deepEqual(calls[1].slice(0, 2), [
      process.execPath, ["node_modules/next/dist/bin/next", "typegen"],
    ]);
    assert.deepEqual(calls[2].slice(0, 2), typecheckArguments(projects[0]));
    assert.deepEqual(calls.at(-1).slice(0, 2), [
      platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "--", "--turbopack"],
    ]);
    assert.equal(calls.at(-1)[2].env.NEXT_TYPES_CHECKED_BEFORE_BUILD, "1");
    for (const call of calls.slice(0, -1)) {
      assert.equal(call[2].env.NEXT_TYPES_CHECKED_BEFORE_BUILD, undefined);
    }
  }
});

test("generates standalone output after compilation releases memory", () => {
  for (const env of [
    { NEXT_BUILD_MEMORY_CAPPED: "1" },
    { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted" },
  ]) {
    const calls = [];
    const result = runBuild({
      projects: ["slice.json"],
      env,
      spawn: (...args) => {
        calls.push(args);
        return { status: 0 };
      },
    });
    assert.equal(result, 0);
    assert.equal(calls.length, 5);
    assert.deepEqual(calls.slice(-2).map(([tool, args]) => [tool, ...args]),
      ["compile", "generate"].map((mode) => [
        process.execPath, "node_modules/next/dist/bin/next", "build", "--turbopack", "--experimental-build-mode", mode,
      ]));
    for (const [, , { env: buildEnv }] of calls.slice(-2)) {
      assert.equal(buildEnv.NEXT_TYPES_CHECKED_BEFORE_BUILD, "1");
      assert.equal(buildEnv.RAYON_NUM_THREADS, "2");
      assert.equal(buildEnv.TOKIO_WORKER_THREADS, "2");
    }
  }
});

test("does not generate output after a failed standalone compilation", () => {
  const stages = [];
  const result = runBuild({
    projects: ["slice.json"],
    env: { NEXT_BUILD_MEMORY_CAPPED: "1" },
    spawn: (_executable, args) => {
      if (!args.includes("--experimental-build-mode")) return { status: 0 };
      const stage = args.at(-1);
      stages.push(stage);
      return { status: 7 };
    },
  });
  assert.equal(result, 7);
  assert.deepEqual(stages, ["compile"]);
});

test("a caller shortcut cannot bypass a failed preparation or type check", () => {
  const projects = ["project-a.json", "project-b.json"];
  for (const failedStep of [1, 2]) {
    const calls = [];
    const result = runBuild({
      projects,
      env: { NEXT_TYPES_CHECKED_BEFORE_BUILD: "1" },
      spawn: (...args) => {
        calls.push(args);
        return { status: calls.length === failedStep ? 9 : 0 };
      },
    });
    assert.equal(result, 9);
    assert.equal(calls.length, failedStep);
    assert.ok(calls.every((call) => !call[2].env.NEXT_TYPES_CHECKED_BEFORE_BUILD));
  }
  const calls = [];
  const result = runBuild({
    projects,
    env: { NEXT_TYPES_CHECKED_BEFORE_BUILD: "1" },
    spawn: (...args) => {
      calls.push(args);
      return { status: calls.length === 3 ? 9 : 0 };
    },
  });
  assert.equal(result, 9);
  assert.equal(calls.length, 4);
  assert.equal(calls.at(-1)[1][0], "node_modules/typescript/lib/tsc.js");
  assert.ok(calls.every((call) => !call[2].env.NEXT_TYPES_CHECKED_BEFORE_BUILD));
});

test("an interrupted checker fails the build before compilation", () => {
  let calls = 0;
  assert.equal(runBuild({
    projects: ["project-a.json"],
    spawn: () => ({ status: ++calls === 3 ? null : 0 }),
  }), 1);
  assert.equal(calls, 3);
});

test("sliced typecheck runs every slice and skips build preparation", () => {
  const calls = [];
  const result = runTypecheck({
    projects: ["a.json", "b.json"],
    env: { GOMEMLIMIT: "8GiB", GOMAXPROCS: "8", NODE_OPTIONS: "--max-old-space-size=6144" },
    spawn: (...args) => {
      calls.push(args);
      return { status: calls.length === 1 ? 2 : 0 };
    },
  });
  assert.equal(result, 2);
  assert.deepEqual(calls.map((call) => call[1][0]), [
    "node_modules/typescript/lib/tsc.js",
    "node_modules/typescript/lib/tsc.js",
  ]);
  assert.equal(calls[0][2].env.GOMEMLIMIT, "6GiB");
  assert.equal(calls[0][2].env.GOMAXPROCS, "2");
  assert.match(calls[0][2].env.NODE_OPTIONS, /--max-old-space-size=4096/);
  assert.deepEqual(calls[0][1].slice(1, 6), ["--noEmit", "--checkers", "1", "--incremental", "false"]);
});
