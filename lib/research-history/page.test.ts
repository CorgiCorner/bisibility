import { describe, expect, it } from "vitest";
import type { HistoryRow } from "./contract";
import { groupHistoryByDay, historyDayKey } from "./group-by-day";
import {
  assembleHistoryPage,
  decodeHistoryCursor,
  encodeHistoryCursor,
  sliceHistoryIds,
} from "./page";

function row(overrides: Partial<HistoryRow> & Pick<HistoryRow, "key" | "occurredAt">): HistoryRow {
  return {
    cost: { kind: "unknown" },
    meta: { engines: ["chat_gpt"], kind: "model" },
    pinned: false,
    title: overrides.key,
    ...overrides,
  };
}

describe("history day groups", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("keeps the calendar day of the project time zone", () => {
    expect(historyDayKey("2026-11-10T23:30:00.000Z", "UTC")).toBe("2026-11-10");
    expect(historyDayKey("2026-11-10T23:30:00.000Z", "Asia/Tokyo")).toBe("2026-11-11");
    expect(historyDayKey("2026-11-10T00:30:00.000Z", "America/Los_Angeles")).toBe("2026-11-09");
  });

  it("labels today and yesterday from the project calendar, not a 24 hour shift", () => {
    const tokyo = groupHistoryByDay(
      [row({ key: "late", occurredAt: "2026-11-10T23:30:00.000Z" })],
      "Asia/Tokyo",
      now,
    );
    const losAngeles = groupHistoryByDay(
      [row({ key: "early", occurredAt: "2026-11-10T00:30:00.000Z" })],
      "America/Los_Angeles",
      now,
    );
    expect(tokyo[0]?.label).toBe("date");
    expect(losAngeles[0]?.label).toBe("yesterday");
    expect(
      groupHistoryByDay([row({ key: "now", occurredAt: now.toISOString() })], "UTC", now)[0]?.label,
    ).toBe("today");
  });
});

describe("history pages", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("groups the database page it is given and keeps the supplied totals", () => {
    const page = assembleHistoryPage({
      chips: [{ facet: "engine", value: "chat_gpt" }],
      nextCursor: "next",
      now,
      pinnedCount: 4,
      rows: [row({ key: "one", occurredAt: now.toISOString() })],
      timeZone: "UTC",
      total: 40,
    });
    expect(page.groups[0]?.rows.map((item) => item.key)).toEqual(["one"]);
    expect(page.groups[0]?.label).toBe("today");
    expect(page).toMatchObject({ nextCursor: "next", pinnedCount: 4, total: 40 });
  });

  it("keeps 30 ids and points the cursor at the last visible row", () => {
    const ids = Array.from({ length: 31 }, (_, index) => ({
      at: new Date(Date.parse("2026-11-10T00:00:00.000Z") + index * 60_000),
      id: `id-${String(index).padStart(2, "0")}`,
    }));
    const page = sliceHistoryIds(ids, undefined);
    expect(page.rows).toHaveLength(30);
    expect(decodeHistoryCursor(page.nextCursor)).toEqual({
      at: ids[29]?.at.toISOString(),
      id: "id-29",
    });
    expect(sliceHistoryIds(ids.slice(0, 3), 3).nextCursor).toBeNull();
    expect(decodeHistoryCursor("not-a-cursor")).toBeNull();
    expect(decodeHistoryCursor(encodeHistoryCursor({ at: now.toISOString(), id: "id-1" }))).toEqual(
      {
        at: now.toISOString(),
        id: "id-1",
      },
    );
  });
});
