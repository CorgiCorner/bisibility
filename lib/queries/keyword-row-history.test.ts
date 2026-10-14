import { comparablePositionPoints } from "@/lib/queries/keyword-row-history";
import { describe, expect, it } from "vitest";

describe("position history ranking URLs", () => {
  it("retains the URL of each check when the ranking page changes", () => {
    const points = comparablePositionPoints([
      {
        checkedAt: new Date("2026-10-01T09:00:00.000Z"),
        position: 5,
        rankingUrl: "https://example.com/a",
      },
      {
        checkedAt: new Date("2026-10-08T09:00:00.000Z"),
        position: 3,
        rankingUrl: "https://example.com/b",
      },
    ]);

    const exported = points.map(({ checkedAt, position, rankingUrl }) => ({
      checkedAt,
      position,
      rankingUrl,
    }));
    expect(exported).toEqual([
      {
        checkedAt: "2026-10-01T09:00:00.000Z",
        position: 5,
        rankingUrl: "https://example.com/a",
      },
      {
        checkedAt: "2026-10-08T09:00:00.000Z",
        position: 3,
        rankingUrl: "https://example.com/b",
      },
    ]);
  });

  it("keeps a missing historical URL unknown beside a later known page", () => {
    const points = comparablePositionPoints([
      { checkedAt: new Date("2026-10-01T09:00:00.000Z"), position: 5 },
      {
        checkedAt: new Date("2026-10-08T09:00:00.000Z"),
        position: 3,
        rankingUrl: "https://example.com/b",
      },
    ]);

    expect(points.map((point) => point.rankingUrl)).toEqual([null, "https://example.com/b"]);
  });
});
