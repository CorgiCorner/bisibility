import { describe, expect, it } from "vitest";
import { assembleChallengeReport, settleChallengeTiles } from "./assemble";
import { periodProjectMinor } from "./cost-period";
import { disconnectedChallengeBody, sampleChallengeBody } from "./fixtures";
import { eachDate, MAX_BODY_BYTES } from "./period";
import { challengeReportBodyBytes, challengeReportBodySchema } from "./schema";
import { unavailableTile } from "./tile-state";
import {
  activeDaysTileFor,
  buildActiveDaysTile,
  buildAiAnswersTile,
  buildConversionsTile,
  buildCostTile,
  buildTop10Tile,
} from "./tiles-outcomes";
import { buildClicksTile, buildExistingVsNewTile, buildTopPagesTile } from "./tiles-search";

const names = { domain: "example.com", label: "Example" };

describe("challenge report tiles", () => {
  it("keeps search gaps empty and refuses a fake zero", () => {
    expect(
      buildClicksTile({ connected: false, current: [], markers: [], previous: [] }).state,
    ).toBe("not_connected");
    const empty = buildClicksTile({
      connected: true,
      current: [{ clicks: null, dateKey: "2026-01-01" }],
      markers: [],
      previous: [{ clicks: null, dateKey: "2025-12-31" }],
    });
    expect(empty).toEqual(unavailableTile("no_data", "empty"));
    const measured = buildClicksTile({
      connected: true,
      current: [{ clicks: 0, dateKey: "2026-01-01" }],
      markers: [],
      previous: [{ clicks: 4, dateKey: "2025-12-31" }],
    });
    expect(measured.state === "ok" && measured.current).toBe(0);
    expect(measured.state === "ok" && measured.percentChange).toBe(-100);
  });

  it("lists only pages that earned clicks", () => {
    expect(buildTopPagesTile({ connected: false, pages: [] }).state).toBe("not_connected");
    expect(buildTopPagesTile({ connected: true, pages: [{ clicks: 0, path: "/" }] })).toEqual(
      unavailableTile("no_data", "empty"),
    );
    const tile = buildTopPagesTile({
      connected: true,
      pages: [
        { clicks: 2, path: "/b" },
        { clicks: 5, path: "/a" },
      ],
    });
    expect(tile.state === "ok" && tile.pages.map((page) => page.path)).toEqual(["/a", "/b"]);
  });

  it("needs a page snapshot before it splits existing and new clicks", () => {
    expect(
      buildExistingVsNewTile({
        connected: true,
        existingClicks: 0,
        existingPages: 0,
        hasSnapshot: false,
        newClicks: 3,
        newPages: 1,
      }),
    ).toEqual(unavailableTile("no_data", "no_snapshot"));
  });

  it("counts the signed-in member's practice days", () => {
    const tile = buildActiveDaysTile({
      activeDates: ["2026-01-02"],
      from: "2026-01-01",
      to: "2026-01-03",
    });
    expect(tile.state === "ok" && tile.scope).toBe("user");
    expect(tile.state === "ok" && tile.activeCount).toBe(1);
    expect(tile.state === "ok" && tile.skipped).toEqual(["2026-01-01", "2026-01-03"]);
    expect(
      activeDaysTileFor({
        activeDates: [],
        from: "2026-01-01",
        to: "2026-01-03",
        tracked: false,
      }),
    ).toEqual(unavailableTile("no_data", "activity_off"));
  });

  it("names unbranded prompts per engine without inventing a connection", () => {
    expect(
      buildAiAnswersTile({
        connected: false,
        day1: "2026-01-01",
        end: "2026-01-30",
        names,
        prompts: [],
        samples: [],
      }),
    ).toEqual(unavailableTile("not_connected", "ai_visibility"));
    const tile = buildAiAnswersTile({
      connected: true,
      day1: "2026-01-01",
      end: "2026-01-30",
      names,
      prompts: [
        { id: "one", text: "inventory software" },
        { id: "two", text: "Example pricing" },
      ],
      samples: [
        {
          answerText: "Example publishes a guide.",
          at: "2026-01-02T00:00:00.000Z",
          engine: "chat_gpt",
          promptId: "one",
        },
      ],
    });
    expect(tile.state === "ok" && tile.named).toBe(1);
    expect(tile.state === "ok" && tile.total).toBe(1);
    expect(tile.state === "ok" && tile.day1Named).toBe(0);
  });

  it("reports the best upward rank jump", () => {
    expect(buildTop10Tile({ end: [], hasChecks: false, start: [], tracked: 0 })).toEqual(
      unavailableTile("no_data", "no_keywords"),
    );
    const tile = buildTop10Tile({
      end: [
        { keyword: "inventory software", position: 4 },
        { keyword: "warehouse", position: 12 },
      ],
      hasChecks: true,
      start: [
        { keyword: "inventory software", position: 18 },
        { keyword: "warehouse", position: 9 },
      ],
      tracked: 2,
    });
    expect(tile.state === "ok" && tile.startCount).toBe(1);
    expect(tile.state === "ok" && tile.endCount).toBe(1);
    expect(tile.state === "ok" && tile.bestJump).toEqual({
      from: 18,
      keyword: "inventory software",
      to: 4,
    });
  });

  it("names conversion goals and refuses an unconnected source", () => {
    expect(
      buildConversionsTile({ connected: false, current: 4, goals: ["Signup"], previous: 1 }),
    ).toEqual(unavailableTile("not_connected", "conversions"));
    const tile = buildConversionsTile({
      connected: true,
      current: 4,
      goals: ["Signup"],
      previous: 1,
    });
    expect(tile.state === "ok" && tile.current).toBe(4);
  });

  it("splits cost and leaves mixed currencies untotaled", () => {
    expect(
      buildCostTile({
        aiAnswersMinor: 0,
        days: 30,
        other: [],
        rankChecksMinor: 0,
        subscriptions: [],
      }),
    ).toEqual(unavailableTile("no_data", "empty"));
    const mixed = buildCostTile({
      aiAnswersMinor: 100,
      days: 30,
      other: [{ currency: "EUR", minor: 200 }],
      rankChecksMinor: 0,
      subscriptions: [],
    });
    expect(mixed.state === "ok" && mixed.totalMinor).toBeNull();
    const single = buildCostTile({
      aiAnswersMinor: 100,
      days: 30,
      other: [],
      rankChecksMinor: 200,
      subscriptions: [{ currency: "USD", minor: 300 }],
    });
    expect(single.state === "ok" && single.totalMinor).toBe(600);
    expect(single.state === "ok" && single.perDayMinor).toBe(20);
  });

  it("prorates a subscription across the days that fall in the period", () => {
    const share = periodProjectMinor(
      {
        amountMinor: 3100,
        billing: "monthly",
        endedOn: null,
        priceChanges: [],
        projects: [{ basisPoints: null, projectId: "project" }],
        split: "equal",
        startedOn: "2026-01-01",
      },
      "project",
      eachDate("2026-01-01", "2026-01-10"),
    );
    expect(share).toBe(1000);
  });
});

describe("challenge report body", () => {
  it("assembles a failing tile without dropping the report", async () => {
    const settled = await settleChallengeTiles({
      activeDays: async () => unavailableTile("no_data", "empty"),
      aiAnswers: async () => unavailableTile("no_data", "empty"),
      clicks: async () => {
        throw new Error("search failed");
      },
      conversions: async () => unavailableTile("no_data", "empty"),
      cost: async () => unavailableTile("no_data", "empty"),
      existingVsNew: async () => unavailableTile("no_data", "empty"),
      top10: async () => unavailableTile("no_data", "empty"),
      topPages: async () => unavailableTile("no_data", "empty"),
    });
    const body = assembleChallengeReport({
      generatedAt: "2026-02-01T00:00:00.000Z",
      lessons: { dropped: "", unknown: "", worked: "" },
      period: { days: 30, from: "2026-01-01", to: "2026-01-30" },
      settled,
      stage: "day30",
    });
    expect(body.tiles.clicks).toEqual(unavailableTile("no_data", "tile_failed"));
    expect(body.sources).toEqual([]);
    expect(challengeReportBodySchema.parse(body).version).toBe(1);
  });

  it("stays under the size cap and rejects a lesson that is too long", () => {
    const body = sampleChallengeBody();
    expect(challengeReportBodyBytes(body)).toBeLessThan(MAX_BODY_BYTES);
    expect(disconnectedChallengeBody().tiles.clicks.state).toBe("not_connected");
    expect(
      challengeReportBodySchema.safeParse({
        ...body,
        lessons: { ...body.lessons, worked: "x".repeat(2001) },
      }).success,
    ).toBe(false);
  });
});
