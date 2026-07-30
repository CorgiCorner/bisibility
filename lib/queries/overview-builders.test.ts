import { describe, expect, it } from "vitest";
import {
  buildHighlights,
  buildKpis,
  buildTrend,
  type Check,
  type Keyword,
  pos,
  snapshotFor,
} from "./overview-builders";

const now = new Date("2026-06-28T12:00:00.000Z");

function check(position: number | null, overrides: Partial<Check> = {}): Check {
  return {
    checkedAt: new Date("2026-06-28T10:00:00.000Z"),
    position,
    previousPosition: null,
    rankingUrl: position ? `/position-${position}` : null,
    status: "completed",
    ...overrides,
  };
}

function keyword(id: string, rankChecks: Check[] = [], overrides: Partial<Keyword> = {}): Keyword {
  return {
    _count: { rankChecks: rankChecks.length },
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    device: "desktop",
    id,
    publicId: id,
    rankChecks,
    schedule: null,
    text: id,
    ...overrides,
  };
}

function highlights(keywords: Keyword[]) {
  return buildHighlights(keywords.map(snapshotFor), now);
}

function visibilityValue(snapshots: ReturnType<typeof snapshotFor>[]) {
  return buildKpis(snapshots, snapshots.length, 0).find((item) => item.label === "Visibility");
}

describe("overview builders", () => {
  it("treats position sentinels above 100 as outside the tracked range", () => {
    const outside = keyword("outside", [check(101)]);

    expect(pos(100)).toBe(100);
    expect(pos(101)).toBeNull();
    expect(snapshotFor(outside).position).toBeNull();
    expect(buildTrend([outside], { formatDate: (date) => date.toISOString() })).toEqual([]);
  });

  it("uses only genuine earlier in-window positions for movement", () => {
    const firstInWindow = snapshotFor(
      keyword("first", [check(3, { previousPosition: 75 })], {
        _count: { rankChecks: 4 },
      }),
    );
    const twoInWindow = snapshotFor(
      keyword("two", [check(3), check(8, { checkedAt: new Date("2026-06-21T10:00:00.000Z") })]),
    );

    expect(firstInWindow).toMatchObject({ movement: null, position: 3, previous: null });
    expect(twoInWindow).toMatchObject({ movement: 5, position: 3, previous: 8 });
  });

  it("lists keywords added in the last seven days, including checked keywords", () => {
    const rows = highlights([
      keyword("checked-recently", [check(4)], {
        createdAt: new Date("2026-06-28T11:00:00.000Z"),
      }),
      keyword("outside-window", [], { createdAt: new Date("2026-06-21T11:59:59.000Z") }),
      keyword("newest", [], { createdAt: new Date("2026-06-28T10:00:00.000Z") }),
      keyword("third", [], { createdAt: new Date("2026-06-26T10:00:00.000Z") }),
      keyword("fourth", [], { createdAt: new Date("2026-06-25T10:00:00.000Z") }),
      keyword("fifth", [], { createdAt: new Date("2026-06-24T10:00:00.000Z") }),
    ]).find((list) => list.kind === "recentlyAdded")?.rows;

    expect(rows?.map((row) => row.id)).toEqual(["checked-recently", "newest", "third", "fourth"]);
    expect(rows?.[0]).toMatchObject({ note: "Added 1h ago · /position-4", positionText: "#4" });
    expect(rows?.[1]?.note).toBe("Added 2h ago · first check pending");
    expect(rows?.some((row) => row.id === "outside-window")).toBe(false);
  });

  it("requires the newest attempt to succeed before showing a win or drop", () => {
    const failedWin = keyword("failed-win", [
      check(null, { status: "failed" }),
      check(3, { checkedAt: new Date("2026-06-27T10:00:00.000Z") }),
      check(9, { checkedAt: new Date("2026-06-26T10:00:00.000Z") }),
    ]);
    const completedDrop = keyword("completed-drop", [
      check(20),
      check(8, { checkedAt: new Date("2026-06-21T10:00:00.000Z") }),
    ]);
    const result = highlights([failedWin, completedDrop]);

    expect(result.find((list) => list.kind === "wins")?.rows).toEqual([]);
    expect(result.find((list) => list.kind === "attention")?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "failed-win", note: "Latest check failed" }),
        expect.objectContaining({ id: "completed-drop", note: expect.stringContaining("Dropped") }),
      ]),
    );
  });

  it("distinguishes failed, outside-top-100, and running latest attempts", () => {
    const rows = highlights([
      keyword("failed", [check(null, { status: "failed" })]),
      keyword("outside", [check(null, { status: "completed" })]),
      keyword("running", [check(null, { status: "running" })]),
    ]).find((list) => list.kind === "attention")?.rows;

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "failed",
          note: "Latest check failed",
          positionTone: "danger",
        }),
        expect.objectContaining({
          id: "outside",
          note: "Latest check completed - not in top 100",
          positionText: "Not in top 100",
        }),
      ]),
    );
    expect(rows?.some((row) => row.id === "running")).toBe(false);
  });

  it("treats a first observation in the top 10 as a new top-10 entry", () => {
    const rows = highlights([
      keyword("first-ever", [check(3)]),
      keyword("entered", [
        check(9),
        check(14, { checkedAt: new Date("2026-06-21T10:00:00.000Z") }),
      ]),
      keyword("stayed", [check(5), check(8, { checkedAt: new Date("2026-06-21T10:00:00.000Z") })]),
    ]).find((list) => list.kind === "newTop10")?.rows;

    expect(rows?.map((row) => row.id)).toEqual(["first-ever", "entered"]);
  });

  it("shows neutral new deltas for first observations instead of fabricated gains", () => {
    const firstCheck = snapshotFor(keyword("first", [check(2, { previousPosition: 81 })]));

    expect(buildKpis([firstCheck], 2500, 73)).toEqual([
      { delta: "new", deltaTone: "neutral", label: "Avg. position", value: "2.0" },
      { delta: "+73 this month", deltaTone: "neutral", label: "Tracked keywords", value: "2500" },
      { delta: "new", deltaTone: "neutral", label: "In top 10", value: "1" },
      { delta: "new", deltaTone: "neutral", label: "Visibility", value: "57%" },
    ]);
  });

  it("excludes first observations from deltas when comparable history exists", () => {
    const snapshots = [
      snapshotFor(keyword("first", [check(2)])),
      snapshotFor(
        keyword("moved", [
          check(3),
          check(13, { checkedAt: new Date("2026-06-21T10:00:00.000Z") }),
        ]),
      ),
    ];

    expect(buildKpis(snapshots, 2, 0)).toEqual([
      { delta: "up 10.0", deltaTone: "positive", label: "Avg. position", value: "2.5" },
      { delta: "no new this month", deltaTone: "neutral", label: "Tracked keywords", value: "2" },
      { delta: "+1", deltaTone: "positive", label: "In top 10", value: "2" },
      { delta: "+29.0pp", deltaTone: "positive", label: "Visibility", value: "47%" },
    ]);
  });

  it("weights visibility by volume with the specified fallbacks", () => {
    expect(
      visibilityValue([
        snapshotFor(keyword("one", [check(1)]), 10),
        snapshotFor(keyword("two", [check(1)]), 100),
      ])?.value,
    ).toBe("100%");
    expect(visibilityValue([snapshotFor(keyword("outside", [check(null)]), 100)])?.value).toBe(
      "0%",
    );
    expect(
      visibilityValue([
        snapshotFor(keyword("head", [check(1)]), 1000),
        snapshotFor(keyword("tail", [check(20)]), 10),
      ])?.value,
    ).toBe("99%");
    expect(
      visibilityValue([
        snapshotFor(keyword("known-low", [check(20)]), 10),
        snapshotFor(keyword("known-high", [check(20)]), 30),
        snapshotFor(keyword("unknown", [check(1)])),
      ])?.value,
    ).toBe("36%");
    expect(
      visibilityValue([
        snapshotFor(keyword("unweighted-head", [check(1)])),
        snapshotFor(keyword("unweighted-tail", [check(20)])),
      ])?.value,
    ).toBe("52%");
  });

  it("reports visibility deltas in percentage points with directional tone", () => {
    const gain = visibilityValue([
      snapshotFor(
        keyword("gain", [check(1), check(20, { checkedAt: new Date("2026-06-21T10:00:00.000Z") })]),
        100,
      ),
    ]);
    const loss = visibilityValue([
      snapshotFor(
        keyword("loss", [check(20), check(1, { checkedAt: new Date("2026-06-21T10:00:00.000Z") })]),
        100,
      ),
    ]);

    expect(gain).toMatchObject({ delta: "+96.7pp", deltaTone: "positive" });
    expect(loss).toMatchObject({ delta: "-96.7pp", deltaTone: "negative" });
  });

  it("keeps visibility muted while the first check is pending", () => {
    expect(visibilityValue([snapshotFor(keyword("pending"))])).toMatchObject({
      delta: "awaiting first check",
      deltaTone: "neutral",
      value: "–",
    });
  });
});
