import { deriveRankingUrlPeriods } from "@/lib/keyword-detail/ranking-url-history";
import { describe, expect, it } from "vitest";

function check(
  checkedAt: string,
  rankingUrl: string | null,
  position: number | null,
  status = "completed",
  requestedDepth = 100,
) {
  return { checkedAt: new Date(checkedAt), position, rankingUrl, requestedDepth, status };
}

function period(
  startAt: string,
  endAt: string,
  url: string,
  position: number | null,
  note: "Current" | "First seen ranking" | "URL switched" | null,
  isCurrent = note === "Current",
) {
  return {
    endAt: new Date(endAt),
    isCurrent,
    note,
    position,
    requestedDepth: 100,
    startAt: new Date(startAt),
    url,
  };
}

describe("deriveRankingUrlPeriods", () => {
  it("labels one observed URL as first seen when it is also current", () => {
    expect(
      deriveRankingUrlPeriods([
        check("2026-04-20T08:00:00.000Z", "https://example.com/headless-cms", 11),
      ]),
    ).toEqual([
      period(
        "2026-04-20T08:00:00.000Z",
        "2026-04-20T08:00:00.000Z",
        "https://example.com/headless-cms",
        11,
        "First seen ranking",
        true,
      ),
    ]);
  });

  it("keeps one period for consecutive checks of the same URL across time gaps", () => {
    expect(
      deriveRankingUrlPeriods([
        check("2026-01-03T08:00:00.000Z", "https://example.com/headless-cms", 11),
        check("2026-06-18T08:00:00.000Z", "https://example.com/headless-cms", 3),
      ]),
    ).toEqual([
      period(
        "2026-01-03T08:00:00.000Z",
        "2026-06-18T08:00:00.000Z",
        "https://example.com/headless-cms",
        3,
        "First seen ranking",
        true,
      ),
    ]);
  });

  it("creates URL-switched and current periods for different URLs", () => {
    expect(
      deriveRankingUrlPeriods([
        check("2026-06-02T08:00:00.000Z", "https://example.com/guide", 9),
        check("2026-06-18T08:00:00.000Z", "https://example.com/headless-cms", 3),
      ]),
    ).toEqual([
      period(
        "2026-06-02T08:00:00.000Z",
        "2026-06-02T08:00:00.000Z",
        "https://example.com/guide",
        9,
        "First seen ranking",
      ),
      period(
        "2026-06-18T08:00:00.000Z",
        "2026-06-18T08:00:00.000Z",
        "https://example.com/headless-cms",
        3,
        "Current",
      ),
    ]);
  });

  it("starts a new period when a URL reappears after a switch", () => {
    expect(
      deriveRankingUrlPeriods([
        check("2026-06-18T08:00:00.000Z", "https://example.com/headless-cms", 3),
        check("2026-05-12T08:00:00.000Z", "https://example.com/guide", 9),
        check("2026-04-20T08:00:00.000Z", "https://example.com/headless-cms", 11),
      ]),
    ).toEqual([
      period(
        "2026-04-20T08:00:00.000Z",
        "2026-04-20T08:00:00.000Z",
        "https://example.com/headless-cms",
        11,
        "First seen ranking",
      ),
      period(
        "2026-05-12T08:00:00.000Z",
        "2026-05-12T08:00:00.000Z",
        "https://example.com/guide",
        9,
        "URL switched",
      ),
      period(
        "2026-06-18T08:00:00.000Z",
        "2026-06-18T08:00:00.000Z",
        "https://example.com/headless-cms",
        3,
        "Current",
      ),
    ]);
  });

  it("ends a period at a completed check without a ranking URL", () => {
    expect(
      deriveRankingUrlPeriods([
        check("2026-04-20T08:00:00.000Z", "https://example.com/headless-cms", 11),
        check("2026-05-12T08:00:00.000Z", null, null),
        check("2026-06-02T08:00:00.000Z", "https://example.com/headless-cms", 5),
      ]),
    ).toEqual([
      period(
        "2026-04-20T08:00:00.000Z",
        "2026-04-20T08:00:00.000Z",
        "https://example.com/headless-cms",
        11,
        "First seen ranking",
      ),
      period(
        "2026-06-02T08:00:00.000Z",
        "2026-06-02T08:00:00.000Z",
        "https://example.com/headless-cms",
        5,
        "Current",
      ),
    ]);
  });

  it("keeps a null position from the last completed check in its URL period", () => {
    expect(
      deriveRankingUrlPeriods([
        check("2026-04-20T08:00:00.000Z", "https://example.com/headless-cms", 11),
        check("2026-05-12T08:00:00.000Z", "https://example.com/headless-cms", null),
        check("2026-06-02T08:00:00.000Z", "https://example.com/guide", 9),
      ]),
    ).toEqual([
      period(
        "2026-04-20T08:00:00.000Z",
        "2026-05-12T08:00:00.000Z",
        "https://example.com/headless-cms",
        null,
        "First seen ranking",
      ),
      period(
        "2026-06-02T08:00:00.000Z",
        "2026-06-02T08:00:00.000Z",
        "https://example.com/guide",
        9,
        "Current",
      ),
    ]);
  });

  it("ignores non-completed checks when building periods", () => {
    expect(
      deriveRankingUrlPeriods([
        check("2026-04-20T08:00:00.000Z", "https://example.com/headless-cms", 11),
        check("2026-05-12T08:00:00.000Z", null, null, "failed"),
        check("2026-06-02T08:00:00.000Z", "https://example.com/headless-cms", 5),
      ]),
    ).toEqual([
      period(
        "2026-04-20T08:00:00.000Z",
        "2026-06-02T08:00:00.000Z",
        "https://example.com/headless-cms",
        5,
        "First seen ranking",
        true,
      ),
    ]);
  });

  it("marks every period closed when the latest completed check has no ranking URL", () => {
    const periods = deriveRankingUrlPeriods([
      check("2026-04-20T08:00:00.000Z", "https://example.com/headless-cms", 11),
      check("2026-05-12T08:00:00.000Z", "https://example.com/guide", 5),
      check("2026-06-02T08:00:00.000Z", null, null),
    ]);

    expect(periods).toMatchObject([
      { isCurrent: false, note: "First seen ranking", url: "https://example.com/headless-cms" },
      { isCurrent: false, note: "URL switched", url: "https://example.com/guide" },
    ]);
  });
});
