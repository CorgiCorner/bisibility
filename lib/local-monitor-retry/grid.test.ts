import { localPointEvidence } from "@/lib/local-monitor-results/evidence";
import { localResultFixture, resultObservation } from "@/lib/local-monitor-results/fixture";
import { projectLocalRun } from "@/lib/local-monitor-results/projection";
import { localSelectionFixture } from "@/lib/local-monitoring/fixtures";
import {
  freezeGridSelection,
  freezeGridSubsetSelection,
} from "@/lib/local-monitoring/grid-selection";
import { describe, expect, it } from "vitest";
import { monitorRetryApprovalSchema } from "./input-schema";

describe("frozen subset uses the shared sampled-grid oracle", () => {
  it("keeps full-grid validation strict and rejects mixed or foreign points", () => {
    const f = localSelectionFixture(3);
    expect(() => freezeGridSelection(f.grid, [f.targets[0]])).toThrow();
    const subset = freezeGridSubsetSelection(f.grid, [f.targets[0], f.targets[8]]);
    expect(subset.targets).toHaveLength(2);
    expect(subset.gridRevisionKey).toBe(f.grid.revisionKey);
    expect(() => freezeGridSubsetSelection(f.grid, [f.targets[0], f.targets[0]])).toThrow();
    expect(() =>
      freezeGridSubsetSelection(f.grid, [{ ...f.targets[0], pointRevision: "foreign" }]),
    ).toThrow();
    expect(() =>
      freezeGridSubsetSelection(f.grid, [f.targets[0], { ...f.targets[8], keywordId: "foreign" }]),
    ).toThrow();
  });
  it("keeps original ordinal8, one child denominator and no unselected zero or unknown fill", () => {
    const f = localResultFixture(3),
      row = f.binding.rows[8],
      saved = resultObservation(row);
    const binding = {
      ...f.binding,
      rows: [row],
      run: { ...f.binding.run, expectedTargetKeys: [row.stored.targetKey] },
      retry: {
        approval: monitorRetryApprovalSchema.parse({
          version: 1 as const,
          parentRunId: f.binding.run.publicId,
          parentExpectedCount: 9,
          targetIds: [row.stored.publicId],
          sourceHash: "a".repeat(64),
          selectedProofHash: "b".repeat(64),
        }),
        targetIds: [row.stored.publicId],
        targetKeys: [row.stored.targetKey],
      },
    };
    const receipt = { ...f.receipt, expectedCount: 1, items: [f.receipt.items[8]] };
    const evidence = localPointEvidence(
      row,
      saved.observation,
      saved.decisions,
      f.binding.definition.identityRevisionId,
      f.now,
    );
    const result = projectLocalRun(binding, new Map([[row.item.id, evidence]]), receipt, f.now, {
      freshForMs: 600000,
    });
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toMatchObject({ ordinal: 8, row: 2, column: 2 });
    expect(result.grids[0]).toMatchObject({
      expected: 1,
      pointIds: [row.stored.publicId],
      scope: "sampled_points",
      comparison: "unavailable",
      observedRate: 1,
      counts: { expected: 1, metricEligible: 1 },
    });
    expect(f.binding.rows).toHaveLength(9);
  });
});
