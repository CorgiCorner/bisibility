import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { applyPinnedNodeOptions, pinnedNodeOptions } from "./node-memory-limit.mjs";

test("pins one 4 GiB Node heap ceiling", () => {
  assert.equal(pinnedNodeOptions, "--max-old-space-size=4096");
  assert.equal(applyPinnedNodeOptions(""), pinnedNodeOptions);
  assert.equal(
    applyPinnedNodeOptions("--enable-source-maps --max-old-space-size=6144"),
    `--enable-source-maps ${pinnedNodeOptions}`,
  );
});

test("the bounded-memory fixture fails instead of escaping its heap ceiling", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=24",
      "--input-type=module",
      "--eval",
      "const values=[]; for (;;) values.push(new Array(250000).fill(Math.random()));",
    ],
    { encoding: "utf8", timeout: 15_000 },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /heap out of memory|allocation failed/i);
});
