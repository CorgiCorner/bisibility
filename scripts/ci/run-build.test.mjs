import assert from "node:assert/strict";
import test from "node:test";
import { buildNodeOptions } from "./run-build.mjs";

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
