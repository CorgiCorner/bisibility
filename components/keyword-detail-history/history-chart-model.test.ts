import { describe, expect, it } from "vitest";
import { observation, observationPage } from "./history.test-fixture";
import {
  historyRecordTime,
  historyTimestampFraction,
  observationKernelMovement,
  recordedHistorySegments,
} from "./history-chart-model";

describe("recorded timestamp history projection", () => {
  it("uses real elapsed spacing, not equal indices or one point per day", () => {
    const window = {
      basis: "observed_at" as const,
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    };
    expect(historyTimestampFraction(window, Date.parse(window.from))).toBe(0);
    expect(historyTimestampFraction(window, Date.parse("2026-01-02T00:00:00.000Z"))).toBeCloseTo(
      1 / 31,
    );
    expect(historyTimestampFraction(window, Date.parse(window.to))).toBe(1);
    expect(recordedHistorySegments(observationPage(8)).segments[0]?.points).toHaveLength(8);
  });

  it("separates changed methodology and unknown/absent observations without a101 point", () => {
    const page = observationPage();
    page.records = [
      observation(0),
      observation(1),
      observation(2, { evidence: "unknown", position: null, reportedPosition: 101 }),
      observation(3, { comparisonDigest: "scope-v2" }),
      observation(4, { evidence: "known_absent", position: null }),
    ];
    const model = recordedHistorySegments(page);
    expect(model.segments.map((segment) => segment.points.map(({ position }) => position))).toEqual(
      [[6, 6], [6]],
    );
    expect(model.gaps).toBe(2);
    expect(model.boundaries).toBe(1);
  });

  it("does not substitute scheduled checkedAt for missing observation time", () => {
    const record = observation(0, { observedAt: null });
    expect(historyRecordTime(record, "observed_at")).toBeNull();
    expect(historyRecordTime(record, "recorded_at")).toBe(Date.parse(record.recordedAt));
  });

  it("does not manufacture movement by subtracting neighboring observation positions", () => {
    const page = observationPage();
    const record = observation(0);
    expect(observationKernelMovement(page, record)).toBeNull();
  });

  it("does not connect different selected targets even when their scope digests match", () => {
    const page = observationPage();
    page.records = [observation(0), observation(1, { keywordId: "kw_other" }), observation(2)];
    expect(recordedHistorySegments(page).segments).toHaveLength(2);
    expect(
      recordedHistorySegments(page).segments.map(
        (segment) => new Set(segment.points.map((point) => point.observation.keywordId)).size,
      ),
    ).toEqual([1, 1]);
  });
});
