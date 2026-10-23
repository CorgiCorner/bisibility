import { expect, it } from "vitest";
import {
  requireExactUpgradeInventory,
  type SchedulerUpgradeInventory,
  unknownUpgradeSchedule,
} from "./scheduler-upgrade-unknown";

const id = "rank-check-deleted";
function inventory(
  reason: "keyword_missing" | "project_mismatch" | "ambiguous_ownership",
  paused: boolean,
): SchedulerUpgradeInventory {
  return {
    ownedIds: [id],
    pausedOwnedIds: paused ? [id] : [],
    ambiguousIds: [id],
    unrelatedIds: [],
    unrelatedHash: "empty",
    failed: 0,
    inspected: 1,
    listed: 1,
    reconciler: "paused",
    dispatcher: "paused",
    unknownSchedules: [unknownUpgradeSchedule(id, reason, paused)],
  };
}
it("accepts only explicitly acknowledged, already paused deleted-keyword schedules", () => {
  expect(() =>
    requireExactUpgradeInventory(inventory("keyword_missing", true), true),
  ).not.toThrow();
  expect(() => requireExactUpgradeInventory(inventory("keyword_missing", true), false)).toThrow(
    "--list-unknown",
  );
  for (const reason of ["keyword_missing", "project_mismatch", "ambiguous_ownership"] as const) {
    expect(() => requireExactUpgradeInventory(inventory(reason, false), true)).toThrow();
  }
  expect(() => requireExactUpgradeInventory(inventory("project_mismatch", true), true)).toThrow();
  expect(() =>
    requireExactUpgradeInventory(inventory("ambiguous_ownership", true), true),
  ).toThrow();
});
it("supplies shell-quoted inspect, pause and delete commands for the selected namespace", () => {
  const row = unknownUpgradeSchedule("rank-check-owner's", "keyword_missing", false);
  expect(row.commands.describe).toContain('--namespace "$TEMPORAL_NAMESPACE"');
  expect(row.commands.pause).toContain("toggle --schedule-id 'rank-check-owner'\\''s' --pause");
  expect(row.commands.delete).toContain("delete --schedule-id");
});
