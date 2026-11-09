import assert from "node:assert/strict";
import test from "node:test";
import { buildEnvironment, buildNodeOptions, runBuild } from "./run-build.mjs";

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

test("checks generated types before building and preserves a failed build exit", () => {
  for (const platform of ["linux", "win32"]) {
    const calls = [];
    const result = runBuild({
      platform,
      env: { NEXT_BUILD_MEMORY_CAPPED: "1" },
      spawn: (...args) => {
        calls.push(args);
        return { status: calls.length === 4 ? 7 : 0 };
      },
    });
    assert.equal(result, 7);
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[0].slice(0, 2), [
      platform === "win32" ? "npm.cmd" : "npm", ["run", "prebuild"],
    ]);
    assert.deepEqual(calls[1].slice(0, 2), [
      process.execPath, ["node_modules/next/dist/bin/next", "typegen"],
    ]);
    assert.deepEqual(calls[2].slice(0, 2), [
      process.execPath, ["node_modules/typescript/lib/tsc.js", "--noEmit", "--checkers", "1"],
    ]);
    assert.deepEqual(calls[3].slice(0, 2), [
      platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "--", "--turbopack"],
    ]);
    assert.equal(calls[3][2].env.NEXT_TYPES_CHECKED_BEFORE_BUILD, "1");
    for (const call of calls.slice(0, 3)) {
      assert.equal(call[2].env.NEXT_TYPES_CHECKED_BEFORE_BUILD, undefined);
    }
  }
});

test("a caller shortcut cannot bypass a failed preparation or type check", () => {
  for (const failedStep of [1, 2, 3]) {
    const calls = [];
    const result = runBuild({
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
});

test("an interrupted checker fails the build before compilation", () => {
  let calls = 0;
  assert.equal(runBuild({ spawn: () => ({ status: ++calls === 3 ? null : 0 }) }), 1);
  assert.equal(calls, 3);
});
