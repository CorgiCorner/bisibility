import { comparableCompletedWindow } from "@/lib/checks/status";
import { earlierDayPosition } from "@/lib/keywords/position-history";
import { describe, expect, it } from "vitest";

function check(day: number, position: number | null, overrides: Record<string, unknown> = {}) {
  return {
    checkedAt: new Date(`2026-08-${String(day).padStart(2, "0")}T10:00:00.000Z`),
    normalizationVersion: "v2",
    position,
    rankingUrl: `https://example.com/${day}`,
    requestedDepth: 100,
    status: "completed",
    ...overrides,
  };
}

function bounded(checks: ReturnType<typeof check>[]) {
  return checks.filter((item) => item.status !== "deferred").slice(0, 12);
}

describe("rank tracker bounded history policy", () => {
  it("uses an earlier-day baseline instead of a same-day rerun", () => {
    const checks = [
      check(25, 6),
      check(25, 4, { checkedAt: new Date("2026-08-25T08:00:00Z") }),
      check(24, 3),
    ];
    expect(earlierDayPosition(checks, checks[0])).toBe(3);
  });

  it("stops comparable history at the first metadata boundary", () => {
    const checks = [
      check(25, 6),
      check(24, 5),
      check(23, 4, { normalizationVersion: "v1" }),
      check(22, 3),
    ];
    const window = comparableCompletedWindow(bounded(checks));
    expect(window.checks.map((item) => item.position)).toEqual([6, 5]);
    expect(window.boundary?.position).toBe(4);
  });

  it("excludes comparison and URL changes older than newest 12 non-deferred attempts", () => {
    const checks = Array.from({ length: 13 }, (_, index) => check(25 - index, index + 1));
    checks[12] = check(13, 13, { rankingUrl: "https://example.com/old" });
    const window = bounded(checks);
    expect(window).toHaveLength(12);
    expect(window.some((item) => item.rankingUrl?.endsWith("/old"))).toBe(false);
  });

  it("counts URL changes from completed attempts only", () => {
    const checks = bounded([
      check(25, 1, { rankingUrl: "https://example.com/a" }),
      check(24, 2, { rankingUrl: "https://example.com/failure", status: "failed" }),
      check(23, 3, { rankingUrl: "https://example.com/a" }),
    ]);
    const urls = new Set(
      checks
        .filter((item) => item.status === "completed" && item.rankingUrl)
        .map((item) => item.rankingUrl),
    );
    expect(urls.size).toBe(1);
  });
});
