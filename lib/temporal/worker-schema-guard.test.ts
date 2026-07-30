import { describe, expect, it } from "vitest";
import type { MigrationComparison } from "../db/migration-state";
import {
  decideWorkerSchemaGuard,
  type WorkerSchemaGuardMode,
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
});
