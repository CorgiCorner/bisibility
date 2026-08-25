import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { MigrationComparison } from "../db/migration-state";
import {
  decideWorkerSchemaGuard,
  type WorkerSchemaGuardMode,
  workerSchemaDriftDedupeKey,
  workerSchemaGuardMode,
} from "./worker-schema-guard";

const outcomes: MigrationComparison[] = ["ok", "worker-behind", "worker-ahead", "unknown"];
const modes: WorkerSchemaGuardMode[] = ["enforce", "warn", "off"];

describe("worker schema guard decisions", () => {
  it.each(modes.flatMap((mode) => outcomes.map((comparison) => ({ comparison, mode }))))(
    "decides $mode behavior for $comparison",
    ({ comparison, mode }) => {
      const decision = decideWorkerSchemaGuard(mode, comparison);

      if (mode === "off") {
        expect(decision).toEqual({
          block: false,
          check: false,
          logLevel: null,
          notify: false,
        });
        return;
      }

      expect(decision.check).toBe(true);
      expect(decision.block).toBe(mode === "enforce" && comparison === "worker-behind");
      expect(decision.notify).toBe(
        comparison === "worker-behind" || (mode === "warn" && comparison === "worker-ahead"),
      );
    },
  );

  it("defaults missing and invalid values to enforce", () => {
    expect(workerSchemaGuardMode(undefined)).toBe("enforce");
    expect(workerSchemaGuardMode("invalid")).toBe("enforce");
  });

  it("builds a stable drift notification key from both schema sides and the release", () => {
    expect(
      workerSchemaDriftDedupeKey({
        appliedLatest: "20260824200000_provider_usage_attribution",
        bundledLatest: "20260821191116_add_rank_check_error_code",
        comparison: "worker-behind",
        release: "c992bc92581d84dfe104ef49854414a1df0b02a1",
      }),
    ).toBe(
      "worker_schema_drift:worker-behind:20260824200000_provider_usage_attribution:20260821191116_add_rank_check_error_code:c992bc92581d84dfe104ef49854414a1df0b02a1",
    );
  });

  it("uses explicit unknown segments when a migration summary is unavailable", () => {
    expect(
      workerSchemaDriftDedupeKey({
        appliedLatest: null,
        bundledLatest: null,
        comparison: "unknown",
        release: "unknown",
      }),
    ).toBe("worker_schema_drift:unknown:unknown:unknown:unknown");
  });

  it("wires the drift dedupe key into the worker notification", () => {
    const workerSource = readFileSync(resolve("lib/temporal/worker.ts"), "utf8");

    expect(workerSource).toContain("dedupeKey: workerSchemaDriftDedupeKey({");
  });
});
