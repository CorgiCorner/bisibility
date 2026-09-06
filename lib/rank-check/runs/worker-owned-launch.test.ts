import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const launchWritePaths = [
  "lib/rank-check/planner/launch-due.ts",
  "lib/rank-check/planner/queued-launch.ts",
  "lib/rank-check/runs/reconcile.ts",
  "lib/temporal/rank-check-run-activities.ts",
];

describe("worker-owned rank-check launches", () => {
  it("does not write the retired engine-unavailable blockage", async () => {
    const retiredReason = ["temporal", "unavailable"].join("_");
    const sources = await Promise.all(
      launchWritePaths.map((path) => readFile(resolve(path), "utf8")),
    );

    expect(sources.some((source) => source.includes(retiredReason))).toBe(false);
  });
});
