import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("the application image build uses the canonical heap ceiling", () => {
  const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
  const builderStage = dockerfile.match(
    /FROM node:22\.23\.1-alpine AS builder(?<body>[\s\S]*?)FROM builder AS migrate/,
  )?.groups?.body;

  assert.ok(builderStage, "Dockerfile must retain a distinct application builder stage");
  assert.match(
    builderStage,
    /NODE_OPTIONS="\$\(node scripts\/ci\/node-memory-limit\.mjs --merge\)" npm run build/,
  );
});
