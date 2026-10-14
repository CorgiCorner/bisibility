import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { describe, expect, it } from "vitest";
import { emptyCheckStates } from "./keyword-empty-check-states";
import {
  currentScopeUnavailableRow,
  rankPoint,
  rankQualityGroup,
  rankQualityRow,
} from "./keyword-rank-quality.test-fixture";
import {
  hasRetainedRankHistory,
  keywordRankEvent,
  keywordRankMovement,
  keywordRankQuality,
  keywordRankView,
  keywordRecordedAttempt,
} from "./keyword-rank-quality-view";

describe("keyword rank presentation contract", () => {
  it("keeps a legacy positive as retained data without current KPI or numeric movement", () => {
    const row = {
      ...keywordRows[0],
      position: 6,
      positionBaseline: 9,
      hasRankData: true,
      dataAsOfAt: null,
    };
    expect(keywordRankView(row)).toMatchObject({
      currentPosition: null,
      freshness: "unknown",
      lastKnown: { position: 6, observedAt: null, recordedAt: null },
    });
    expect(keywordRankMovement(row)).toBeNull();
    expect(keywordRankEvent(row)).toBeNull();
    expect(hasRetainedRankHistory(row)).toBe(false);
  });

  it("never promotes raw reported position when current definition proof is missing", () => {
    const row = currentScopeUnavailableRow();
    expect(row.rankQuality.current?.reportedPosition).toBe(6);
    expect(keywordRankView(row)).toMatchObject({
      currentPosition: null,
      evidence: "unknown",
      reason: "current_scope_unavailable",
      lastKnown: { position: 6 },
    });
    expect(keywordRankMovement(row)).toBeNull();
    expect(hasRetainedRankHistory(row)).toBe(true);
    expect(emptyCheckStates([row])).toEqual([]);
  });

  it("uses kernel movement and refuses numeric change without its actual pair", () => {
    const row = rankQualityRow();
    expect(keywordRankMovement({ ...row, position: 90, positionBaseline: 2 })).toBe(3);
    row.rankQuality.comparison = "unavailable";
    expect(keywordRankMovement(row)).toBeNull();
    row.rankQuality.comparison = "comparable";
    row.rankQuality.baseline = rankPoint({ evidence: "known_absent", position: null });
    expect(keywordRankMovement(row)).toBeNull();
  });

  it("does not emit New from missing baseline or from a comparison that was not requested", () => {
    const row = rankQualityRow();
    row.rankQuality = {
      ...row.rankQuality,
      baseline: null,
      event: null,
      comparison: "not_requested",
      movement: null,
    };
    expect(keywordRankEvent(row)).toBeNull();
    expect(keywordRankMovement(row)).toBeNull();
  });

  it("reads group quality from its complete report and never a copied first-child sidecar", () => {
    const group = rankQualityGroup();
    const first = rankQualityRow();
    const poisoned = {
      ...group,
      rankQuality: first.rankQuality,
      lastCheckStatus: "failed" as const,
      positionBaseline: 50,
    };
    expect(keywordRankQuality(poisoned)).toBeNull();
    expect(keywordRankView(poisoned)).toMatchObject({
      isGroup: true,
      currentPosition: 6,
      freshness: "unknown",
      group: { metric: { counts: { expected: 2, ranked: 1, unknown: 1 } } },
    });
    expect(keywordRankMovement(poisoned)).toBeNull();
    expect(hasRetainedRankHistory(poisoned)).toBe(false);
  });

  it("does not infer current group coverage from a legacy minimum position", () => {
    const { rankGroupReport: _report, ...group } = rankQualityGroup();
    expect(keywordRankView(group)).toMatchObject({
      currentPosition: null,
      freshness: "unknown",
      lastKnown: { position: 6, observedAt: null },
    });
    expect(keywordRankMovement(group)).toBeNull();
  });

  it("selects the actual latest recorded child attempt independently of observed time and copied parent state", () => {
    const group = rankQualityGroup();
    const metadata = group.marketGrid;
    if (metadata?.kind !== "parent") throw new Error("Fixture requires a parent");
    const first = metadata.aggregate.children[0];
    if (!first) throw new Error("Fixture requires a child");
    const newer = rankQualityRow("kw_newer");
    const attempt = newer.rankQuality.latestAttempt;
    if (!attempt) throw new Error("Fixture requires an attempt");
    newer.rankQuality.latestAttempt = {
      ...attempt,
      id: "chk_new",
      recordedAt: "2026-10-11T10:00:00.000Z",
      observedAt: "2026-10-01T10:00:00.000Z",
      status: "deferred",
    };
    group.marketGrid = {
      kind: "parent",
      aggregate: { ...metadata.aggregate, children: [first, newer] },
    };
    expect(keywordRecordedAttempt(group)).toMatchObject({
      id: "chk_new",
      status: "deferred",
      recordedAt: "2026-10-11T10:00:00.000Z",
    });
  });

  it("keeps confirmed absence rankless instead of using the compatibility 101 value", () => {
    const row = rankQualityRow();
    row.rankQuality.current = rankPoint({
      evidence: "known_absent",
      position: null,
      reportedPosition: null,
    });
    expect(keywordRankView({ ...row, position: 101, hasRankData: false })).toMatchObject({
      currentPosition: null,
      evidence: "known_absent",
    });
  });

  it("does not show a legacy group minimum made from out-of-depth sentinel children", () => {
    const { rankGroupReport: _report, ...group } = rankQualityGroup();
    const metadata = group.marketGrid;
    if (metadata?.kind !== "parent") throw new Error("Fixture requires a parent");
    group.marketGrid = {
      kind: "parent",
      aggregate: {
        ...metadata.aggregate,
        position: 101,
        children: metadata.aggregate.children.map((child) => ({
          ...child,
          position: 101,
          hasRankData: false,
          trackedDepth: 100,
        })),
      },
    };
    expect(keywordRankView(group).lastKnown).toBeNull();
  });
});
