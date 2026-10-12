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

test("builds with the isolated webpack compiler and preserves a failed build exit", () => {
  for (const platform of ["linux", "win32"]) {
    const calls = [];
    const result = runBuild({
      platform,
      env: { NEXT_BUILD_MEMORY_CAPPED: "1" },
      spawn: (...args) => {
        calls.push(args);
        return { status: 7 };
      },
    });
    assert.equal(result, 7);
    assert.deepEqual(calls, [
      [
        platform === "win32" ? "npm.cmd" : "npm",
        ["run", "build", "--", "--webpack"],
        {
          env: {
            NEXT_BUILD_MEMORY_CAPPED: "1",
            NODE_OPTIONS: "--max-old-space-size=4096",
            GOMEMLIMIT: "6GiB",
            GOMAXPROCS: "2",
          },
          stdio: "inherit",
        },
      ],
    ]);
  }
});
