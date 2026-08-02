import { dateFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ctrDropDateRanges,
  ctrDropSnapshotDates,
  ctrDropSummary,
  loadGscCtrMetrics,
} from "./ctr-drop";

const mocks = vi.hoisted(() => ({
  prisma: { keywordTrafficSnapshot: { findFirst: vi.fn() } },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("CTR drop evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches a threshold drop when average rank remains stable", () => {
    expect(
      ctrDropSummary(
        {
          baselineCtr: 0.1,
          baselinePosition: 4.2,
          currentCtr: 0.07,
          currentPosition: 4.8,
        },
        20,
      ),
    ).toEqual(expect.objectContaining({ baselineCtr: 0.1, currentCtr: 0.07, decreasePct: 30 }));
  });

  it("does not match when average rank moved by more than one position", () => {
    expect(
      ctrDropSummary(
        {
          baselineCtr: 0.1,
          baselinePosition: 4,
          currentCtr: 0.05,
          currentPosition: 5.1,
        },
        20,
      ),
    ).toBeNull();
  });

  it("detects a 40% seven-day drop that a 28-day aggregate dilutes to 10%", () => {
    const recentSevenDayCtr = 0.06;
    const dilutedTwentyEightDayCtr = (0.1 * 21 + recentSevenDayCtr * 7) / 28;

    const recentDrop = ctrDropSummary(
      {
        baselineCtr: 0.1,
        baselinePosition: 4,
        currentCtr: recentSevenDayCtr,
        currentPosition: 4,
      },
      20,
    );

    expect(recentDrop?.decreasePct).toBeCloseTo(40);
    expect(dilutedTwentyEightDayCtr).toBeCloseTo(0.09);
    expect(
      ctrDropSummary(
        {
          baselineCtr: 0.1,
          baselinePosition: 4,
          currentCtr: dilutedTwentyEightDayCtr,
          currentPosition: 4,
        },
        20,
      ),
    ).toBeNull();
  });

  it("uses a seven-day current window and the immediately preceding 28-day baseline", () => {
    expect(ctrDropDateRanges(new Date("2026-07-16T18:00:00.000Z"))).toEqual({
      baseline: { endDate: "2026-07-08", startDate: "2026-06-11" },
      current: { endDate: "2026-07-15", startDate: "2026-07-09" },
    });
  });

  it("maps the comparison endpoints to finalized snapshot dates", () => {
    expect(ctrDropSnapshotDates(new Date("2026-07-16T18:00:00.000Z"))).toEqual({
      baseline: new Date("2026-07-06T00:00:00.000Z"),
      current: new Date("2026-07-13T00:00:00.000Z"),
    });
  });

  it("compares the stored 28-day baseline with the stored seven-day current window", async () => {
    mocks.prisma.keywordTrafficSnapshot.findFirst
      .mockResolvedValueOnce({
        ctr: 0.1,
        date: new Date("2026-07-06T00:00:00.000Z"),
        impressions: 100,
        position: 4.2,
      })
      .mockResolvedValueOnce({
        ctr: 0.07,
        date: new Date("2026-07-13T00:00:00.000Z"),
        impressions: 120,
        position: 4.8,
      });

    await expect(
      loadGscCtrMetrics({
        checkedAt: new Date("2026-07-16T18:00:00.000Z"),
        keywordId: "keyword_1",
      }),
    ).resolves.toEqual({
      baselineCtr: 0.1,
      baselinePosition: 4.2,
      currentCtr: 0.07,
      currentPosition: 4.8,
    });
    expect(mocks.prisma.keywordTrafficSnapshot.findFirst).toHaveBeenNthCalledWith(1, {
      orderBy: { date: "desc" },
      select: { ctr: true, date: true, impressions: true, position: true },
      where: {
        date: {
          gte: new Date("2026-07-04T00:00:00.000Z"),
          lte: new Date("2026-07-06T00:00:00.000Z"),
        },
        keywordId: "keyword_1",
        provider: "gsc",
        windowDays: 28,
      },
    });
    expect(mocks.prisma.keywordTrafficSnapshot.findFirst).toHaveBeenNthCalledWith(2, {
      orderBy: { date: "desc" },
      select: { ctr: true, date: true, impressions: true, position: true },
      where: {
        date: {
          gte: dateFromFrozenNow({ hours: 1 }),
          lte: new Date("2026-07-13T00:00:00.000Z"),
        },
        keywordId: "keyword_1",
        provider: "gsc",
        windowDays: 7,
      },
    });
  });

  it("uses the nearest snapshot up to two days before each endpoint", async () => {
    mocks.prisma.keywordTrafficSnapshot.findFirst
      .mockResolvedValueOnce({
        ctr: 0.1,
        date: new Date("2026-07-05T00:00:00.000Z"),
        impressions: 100,
        position: 4.2,
      })
      .mockResolvedValueOnce({
        ctr: 0.07,
        date: new Date("2026-07-12T00:00:00.000Z"),
        impressions: 120,
        position: 4.8,
      });

    await expect(
      loadGscCtrMetrics({
        checkedAt: new Date("2026-07-16T18:00:00.000Z"),
        keywordId: "keyword_1",
      }),
    ).resolves.toEqual({
      baselineCtr: 0.1,
      baselinePosition: 4.2,
      currentCtr: 0.07,
      currentPosition: 4.8,
    });
  });

  it("returns no metrics when seven-day snapshot history is unavailable", async () => {
    mocks.prisma.keywordTrafficSnapshot.findFirst
      .mockResolvedValueOnce({
        ctr: 0.1,
        date: new Date("2026-07-06T00:00:00.000Z"),
        impressions: 100,
        position: 4.2,
      })
      .mockResolvedValueOnce(null);

    await expect(
      loadGscCtrMetrics({
        checkedAt: new Date("2026-07-16T18:00:00.000Z"),
        keywordId: "keyword_1",
      }),
    ).resolves.toBeNull();
  });
});
