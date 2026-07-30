import { describe, expect, it } from "vitest";
import type { UpcomingScheduleSource } from "./upcoming-view";
import { buildUpcomingView } from "./upcoming-view";

const NOW = new Date("2026-07-24T22:30:00.000Z");

function schedule(id: string, nextCheckAt: string, serpDepth = 10): UpcomingScheduleSource {
  return {
    frequency: "daily",
    keyword: `keyword ${id}`,
    keywordId: `keyword_${id}`,
    keywordPublicId: `kw_${id}`,
    nextCheckAt: new Date(nextCheckAt),
    serpDepth,
  };
}

describe("upcoming checks view", () => {
  it("groups the next seven days in the project timezone and estimates default costs", () => {
    const view = buildUpcomingView({
      blockedReason: null,
      budgetCapCents: 100,
      now: NOW,
      projectTimezone: "Europe/Warsaw",
      providers: [
        { provider: "dataforseo", providerLabel: "DataForSEO" },
        { provider: "serpapi", providerLabel: "SerpAPI" },
      ],
      schedules: [
        schedule("1", "2026-07-24T23:00:00.000Z"),
        schedule("2", "2026-07-25T23:00:00.000Z", 20),
        schedule("3", "2026-07-26T23:00:00.000Z"),
      ],
      spentCents: 10,
    });

    expect(
      view.days.map((day) => ({ cost: day.estimatedCostCents, key: day.key, label: day.label })),
    ).toEqual([
      { cost: 0.2, key: "2026-07-25", label: "Today" },
      { cost: 0.35, key: "2026-07-26", label: "Tomorrow" },
      { cost: 0.2, key: "2026-07-27", label: "Mon, Jul 27" },
    ]);
    expect(view.forecast?.next48hCents).toBeCloseTo(0.55);
    expect(view.forecast?.capLastsUntil).not.toBeNull();
    expect(view.providerSummary).toBe("DataForSEO +1 fallback");
    expect(view.timeZone).toBe("Europe/Warsaw");
  });

  it("limits samples, aggregates blocked keywords, and handles a zero daily rate", () => {
    const schedules = ["1", "2", "3", "4"].map((id) => schedule(id, "2026-07-30T10:00:00.000Z"));
    const view = buildUpcomingView({
      blockedReason: "no_provider",
      budgetCapCents: 100,
      now: NOW,
      projectTimezone: "UTC",
      providers: [],
      schedules,
      spentCents: 0,
    });

    expect(view.blocked).toEqual([{ keywordCount: 4, reason: "no_provider" }]);
    expect(view.days[0]).toMatchObject({ count: 4, estimatedCostCents: 0 });
    expect(view.days[0]?.samples).toHaveLength(3);
    expect(view.forecast).toEqual({
      capCents: 100,
      capLastsUntil: null,
      next48hCents: 0,
      spentCents: 0,
    });
    expect(view.providerSummary).toBe("No provider connected");
    expect(view.timeZone).toBe("UTC");
  });

  it("omits zero-sized blocker groups when no next occurrences are scheduled", () => {
    const view = buildUpcomingView({
      blockedReason: "no_provider",
      budgetCapCents: 100,
      now: NOW,
      projectTimezone: "UTC",
      providers: [],
      schedules: [],
      spentCents: 0,
    });

    expect(view.blocked).toEqual([]);
  });
});
