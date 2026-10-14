import { rankTrackerQualityFixture } from "@/lib/queries/rank-tracker-report-test-fixture";
import { qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import { reportDigest } from "@/lib/rank-reports/digest";
import {
  reportAsOf,
  reportKeyword,
  reportPolicy,
  reportProject,
} from "@/lib/rank-reports/report-test-fixture";
import { describe, expect, it } from "vitest";
import { keywordDetailRankState, projectKeywordDetailQuality } from "./quality-projector";
import { detailCheck, detailProjection, detailTarget } from "./quality-test-fixture";

describe("keyword detail snapshot quality", () => {
  it("finds Best in all 320 retained checks, independently of the page/window and legacy row minimum", () => {
    const checks = Array.from({ length: 320 }, (_, index) =>
      detailCheck(
        index,
        index === 0 ? 1 : 6,
        {},
        index === 0 ? new Date("2026-01-01T10:00:00.000Z") : undefined,
      ),
    );
    const projected = detailProjection(detailTarget(checks));
    expect(projected.quality).toMatchObject({
      asOf: reportAsOf.toISOString(),
      sourceDigest: "same-report-snapshot",
      retainedChecks: 320,
      best: {
        position: 1,
        id: checks[0].id,
        qualifyingCount: 320,
        definitionOrigin: "current_definition",
      },
    });
    expect(projected.row).toMatchObject({
      position: 6,
      previousPosition: null,
      bestPosition: 1,
      completedComparableChecks: [],
    });
    expect(projected.quality.best?.observedAt).toBe("2026-01-01T10:00:00.000Z");
    expect(projected.quality.best?.observedAt).not.toBe(checks[0].checkedAt.toISOString());
    expect(projected.quality.expectedScope).not.toHaveProperty("projectId");
    expect(projected.quality.expectedScope).not.toHaveProperty("targetId");
  });

  it("retains a qualified position above100 instead of converting it to known absence", () => {
    const result = detailProjection(detailTarget([detailCheck(0, 120, { requestedDepth: 200 })]));
    expect(result.quality.rankQuality.current).toMatchObject({
      evidence: "positive",
      position: 120,
    });
    expect(keywordDetailRankState(result.quality)).toBe("normal");
  });

  it("keeps current unknown and historical Best distinct when current revision proof is unavailable", () => {
    const result = detailProjection({ ...detailTarget(), expectedScope: null });
    expect(result.quality.rankQuality).toMatchObject({
      currentScopeState: "unavailable",
      currentScopeReason: "current_scope_unavailable",
      current: { evidence: "unknown", position: null },
      movement: null,
      lastKnown: { current: { evidence: "positive", position: 6 } },
    });
    expect(result.quality.best?.definitionOrigin).toBe("last_known_definition");
    expect(keywordDetailRankState(result.quality)).toBe("unknown");
  });

  it("does not widen Best to an old target/policy/provider/normalization definition", () => {
    const old = detailCheck(0, 1);
    const current = detailCheck(3, 6);
    if (!old.observationRun) throw new Error("Missing fixture observation");
    const target = detailTarget([
      {
        ...old,
        observationRun: {
          ...old.observationRun,
          requestPolicy: {
            evidence: {
              completeThrough: { organic_result: 100 },
              observedAt: "2026-10-12T09:00:00Z",
              policyRevision: "old-policy",
              targetRevision: "old-target",
              version: 1,
            },
          },
        },
      },
      detailCheck(1, 2, { normalizationVersion: "other-normalization" }),
      detailCheck(2, 3, { observationRun: { ...old.observationRun, provider: "other-provider" } }),
      current,
    ]);
    const result = detailProjection(target);
    const expected = qualifyMeasurement(
      recordedMeasurement(current, reportKeyword, reportProject.id),
      {
        asOf: reportAsOf,
        expectedScope: target.expectedScope,
        requireCurrentScope: true,
        horizon: 3,
      },
    );
    expect(result.quality.best).toMatchObject({
      position: 6,
      qualifyingCount: 1,
      comparisonDigest: reportDigest(expected.comparisonKey),
    });
  });

  it("does not promote an old-revision Best when the verified current definition has no matching check", () => {
    const target = detailTarget();
    if (!target.expectedScope) throw new Error("Expected fixture scope");
    const result = detailProjection({
      ...target,
      expectedScope: { ...target.expectedScope, targetRevision: "new-target" },
    });
    expect(result.quality.best).toBeNull();
    expect(result.quality.rankQuality.current?.reason).toBe("scope_mismatch");
    expect(result.quality.rankQuality.lastKnown.current?.position).toBe(6);
  });

  it("keeps legacy reported values unknown, with no fabricated Best or movement", () => {
    const result = detailProjection(
      detailTarget([detailCheck(0, 2, { observationRun: null, normalizationVersion: null })]),
    );
    expect(result.quality.rankQuality.current).toMatchObject({
      evidence: "unknown",
      reportedPosition: 2,
      position: null,
    });
    expect(result.quality.best).toBeNull();
    expect(result.quality.rankQuality.movement).toBeNull();
  });

  it("preserves strict known-absence qualification and missing comparison tolerance", () => {
    const result = detailProjection({
      ...detailTarget([detailCheck(0, null)]),
      baselineWindow: null,
    });
    expect(result.quality.rankQuality.current?.evidence).toBe("known_absent");
    expect(result.quality.rankQuality.comparisonUnavailableReason).toBe(
      "baseline_tolerance_unavailable",
    );
    expect(result.quality.rankQuality.movement).toBeNull();
    expect(keywordDetailRankState(result.quality)).toBe("not_ranked");
  });

  it("does not hide retained current/Best when a later failed attempt is recorded", () => {
    const failed = detailCheck(2, null, {
      observationRun: null,
      status: "failed",
      provider: "failed-provider",
    });
    const result = detailProjection(detailTarget([detailCheck(0, 2), failed]));
    expect(result.quality).toMatchObject({
      latestAttemptProvider: "failed-provider",
      best: { position: 2 },
      rankQuality: {
        current: { evidence: "positive", position: 2 },
        latestAttempt: {
          id: failed.id,
          status: "failed",
          recordedAt: failed.createdAt.toISOString(),
        },
        event: "unknown",
        movement: null,
      },
    });
  });

  it("derives stale/unknown freshness only from the supplied actual policy", () => {
    const target = detailTarget();
    const policy = reportPolicy();
    expect(
      detailProjection({ ...target, freshForMs: 1 }, policy).quality.rankQuality.current?.freshness,
    ).toBe("stale");
    expect(
      detailProjection({ ...target, freshForMs: null }, { ...policy, freshForMs: 99999999 }).quality
        .rankQuality.current?.freshness,
    ).toBe("unknown");
  });

  it("refuses empty, multi-target and mismatched selections rather than showing another target's minimum", () => {
    const { row } = rankTrackerQualityFixture();
    for (const targets of [
      [],
      [detailTarget(), detailTarget()],
      [{ ...detailTarget(), id: "kw_foreign" }],
    ]) {
      expect(() =>
        projectKeywordDetailQuality(row, targets, reportPolicy(), reportProject.id, "snapshot"),
      ).toThrow();
    }
  });
});
