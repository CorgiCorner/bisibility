import { describe, expect, it } from "vitest";
import {
  cumulativeMembership,
  fillDailyMembership,
  SNAPSHOT_SERIES_MAX_DAYS,
  selectSnapshotMetric,
  shareFromNew,
  sinceSnapshotWindow,
  snapshotSeriesWindow,
} from "./snapshot-series";

describe("snapshot series projection", () => {
  it("adds each day onto the previous total and keeps removed as its own running total", () => {
    expect(
      cumulativeMembership([
        { day: "2026-10-01", existing: 2, fresh: 0, removed: 0 },
        { day: "2026-10-02", existing: 3, fresh: 1, removed: 3 },
        { day: "2026-10-03", existing: 0, fresh: 4, removed: 0 },
      ]),
    ).toEqual([
      { day: "2026-10-01", existing: 2, fresh: 0, removed: 0 },
      { day: "2026-10-02", existing: 5, fresh: 1, removed: 3 },
      { day: "2026-10-03", existing: 5, fresh: 5, removed: 3 },
    ]);
  });

  it("fills missing days with zero before the total is added up", () => {
    const filled = fillDailyMembership(
      new Date("2026-10-01T00:00:00.000Z"),
      new Date("2026-10-03T00:00:00.000Z"),
      [{ day: "2026-10-02", existing: 4, fresh: 1, removed: 0 }],
    );
    expect(cumulativeMembership(filled)).toEqual([
      { day: "2026-10-01", existing: 0, fresh: 0, removed: 0 },
      { day: "2026-10-02", existing: 4, fresh: 1, removed: 0 },
      { day: "2026-10-03", existing: 4, fresh: 1, removed: 0 },
    ]);
  });

  it("keeps at most 400 days and prefers the newest", () => {
    const window = snapshotSeriesWindow(
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2026-10-01T00:00:00.000Z"),
    );
    const span = Math.round((window.to.getTime() - window.from.getTime()) / 86_400_000) + 1;
    expect(span).toBe(SNAPSHOT_SERIES_MAX_DAYS);
    expect(window.to.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("starts the default window on the snapshot date and the short window 27 days earlier", () => {
    const now = new Date("2026-10-21T15:00:00.000Z");
    expect(sinceSnapshotWindow("2026-10-01", now, "since").from.toISOString().slice(0, 10)).toBe(
      "2026-10-01",
    );
    expect(sinceSnapshotWindow("2026-01-01", now, "28").from.toISOString().slice(0, 10)).toBe(
      "2026-09-23",
    );
    expect(sinceSnapshotWindow("2026-10-01", now, "since").to.toISOString().slice(0, 10)).toBe(
      "2026-10-20",
    );
  });

  it("rounds the new-page share and treats an empty total as zero", () => {
    expect(shareFromNew(123, 13)).toBe(10);
    expect(shareFromNew(0, 0)).toBe(0);
    expect(shareFromNew(0, 4)).toBe(100);
  });

  it("does not select a metric whose source is not connected", () => {
    const options = [
      { disabledReason: "not_connected" as const, id: "clicks" as const },
      { disabledReason: null, id: "sessions" as const },
      { disabledReason: "not_connected" as const, id: "ai_cites" as const },
    ];
    expect(selectSnapshotMetric("clicks", options)).toBe("sessions");
    expect(selectSnapshotMetric("sessions", options)).toBe("sessions");
    expect(
      selectSnapshotMetric(undefined, [{ disabledReason: "not_connected", id: "clicks" }]),
    ).toBe(null);
  });
});
