import { describe, expect, it } from "vitest";
import { summaryDetailsModel, summaryRunsHref } from "./details-model";

const entry = {
  checkId: "stored",
  keywordPublicId: "kw_original",
  group: "failed",
  previous: 10,
  current: null,
};
const payload = {
  kind: "scheduled",
  windowStart: "2026-10-23T06:00:00Z",
  windowEnd: "2026-10-23T07:00:00Z",
  runPublicId: null,
  entries: [entry],
  linkedIncidentIds: [],
  linkTarget: { from: "2026-10-23T06:00:00Z", to: "2026-10-23T07:00:00Z", trigger: "scheduled" },
};
const input = {
  payload,
  version: 3,
  notificationVersion: 3,
  withdrawn: false,
  checkIds: ["stored"],
  topN: 7,
  positionMove: 9,
  projectRef: "prj_test",
  checks: new Map([["stored", { keyword: "original", market: "market" }]]),
  evidence: new Map(),
};
describe("UI-5 stored summary replay", () => {
  it("keeps stored IDs, groups, positions and version after a restore or later check", () => {
    const details = summaryDetailsModel({
      ...input,
      checks: new Map([...input.checks, ["later", { keyword: "later", market: "market" }]]),
    });
    expect(details?.version).toBe(3);
    expect(details?.rows).toEqual([expect.objectContaining(entry)]);
    expect(details?.rows).toHaveLength(1);
    expect(details?.topN).toBe(7);
    expect(details?.positionMove).toBe(9);
  });
  it("keeps deleted checks as unavailable in their announced group", () => {
    expect(summaryDetailsModel({ ...input, checks: new Map() })?.rows).toEqual([
      expect.objectContaining({ ...entry, available: false }),
    ]);
  });
  it("refuses mismatched versions or contributions", () => {
    expect(summaryDetailsModel({ ...input, notificationVersion: 4 })).toBeNull();
    expect(summaryDetailsModel({ ...input, checkIds: ["different"] })).toBeNull();
  });
  it("uses separate runs targets for UTC windows and manual runs", () => {
    const href = summaryRunsHref(
      "prj_test",
      payload.linkTarget as { from: string; to: string; trigger: "scheduled" },
    );
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("view")).toBe("checks");
    expect(url.searchParams.get("from")).toBe(payload.windowStart);
    expect(url.searchParams.get("to")).toBe(payload.windowEnd);
    expect(url.searchParams.get("trigger")).toBe("scheduled");
    expect(summaryRunsHref("prj_test", { run: "rcr_aaaaaaaaaaaaaaaaaaaaaaaa" })).toBe(
      "/app/prj_test/runs/rank-checks/rcr_aaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });
});
