import { assertRetainedObservationProject } from "@/lib/rank-reports/database";
import { retainedObservationCid } from "@/lib/rank-reports/records";
import { reportProject } from "@/lib/rank-reports/report-test-fixture";
import { expect, it, vi } from "vitest";
import { transportHistorySnapshot } from "./report-transport-test-fixture";

vi.mock("server-only", () => ({}));
it("retains normalized CID/source axes only from the saved project-bound observation", async () => {
  const snapshot = await transportHistorySnapshot();
  const item = snapshot.records[0]?.items[0];
  expect(item).toMatchObject({
    cid: "18446744073709551615",
    ordinal: 3,
    sourceOrdinal: 3,
    sourcePage: 1,
    sourceBlockId: "retained-block-2",
    promotion: "organic",
    blockPosition: 2,
  });
  expect(item).not.toHaveProperty("rawFragment");
  expect(item).not.toHaveProperty("rating");
  expect(() =>
    assertRetainedObservationProject({ projectId: "foreign-project" }, reportProject.id),
  ).toThrow();
  expect(() => assertRetainedObservationProject({}, reportProject.id)).toThrow();
  expect(() =>
    assertRetainedObservationProject({ projectId: reportProject.id }, reportProject.id),
  ).not.toThrow();
  for (const value of [Number("18446744073709551615"), 123, null, undefined])
    expect(retainedObservationCid(value)).toBeNull();
  expect(retainedObservationCid("18446744073709551615")).toBe("18446744073709551615");
});
