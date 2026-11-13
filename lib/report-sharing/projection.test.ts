import { sampleChallengeBody } from "@/lib/challenge-report/fixtures";
import { CHALLENGE_TILE_IDS } from "@/lib/challenge-report/tile-state";
import { describe, expect, it } from "vitest";
import { shouldCountShareView } from "./access";
import { formatPublicNumber } from "./format";
import { shareImageCopy } from "./image-facts";
import { hiddenTileIds, publicReportView } from "./projection";
import { defaultShareSettings, expiryChoice, parseShareSettings } from "./settings";
import { isLaterStage, pickPendingUpdate } from "./stage";
import { createShareToken, hashShareToken, SHARE_TOKEN_PATTERN } from "./token";

describe("public report projection", () => {
  it.each([
    [1104, true, "1.1k"],
    [1104, false, "1,104"],
    [12, true, "12"],
  ] as const)("formats %s round=%s as %s", (value, round, expected) => {
    expect(formatPublicNumber(value, round, "en")).toBe(expected);
  });

  it("drops hidden tiles, lessons, project ids and emails", () => {
    const body = sampleChallengeBody();
    if (body.tiles.clicks.state === "ok") body.tiles.clicks.current = 1104;
    if (body.tiles.activeDays.state === "ok") body.tiles.activeDays.activeCount = 987654;
    if (body.tiles.top10.state === "ok" && body.tiles.top10.bestJump) {
      body.tiles.top10.bestJump.keyword = "prj_abcdefghijklmnopqrstuvwx";
    }
    body.lessons = { entries: [{ question: "What worked?", answer: "secret@example.com" }] };
    const settings = parseShareSettings({
      roundNumbers: true,
      showLessons: false,
      visibleTiles: ["clicks"],
    });
    const view = publicReportView(body, settings);
    const serialized = JSON.stringify(view);
    expect(view.display.clicks).toBe("1.1k");
    expect(view.lessons).toBeNull();
    expect(view.tiles.clicks?.state).toBe("ok");
    expect(serialized).not.toContain("prj_");
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("987654");
    const tiles = JSON.stringify(view.tiles);
    for (const id of hiddenTileIds(settings)) {
      expect(view.tiles).not.toHaveProperty(id);
      expect(tiles).not.toContain(`"${id}"`);
    }
    expect(serialized).not.toContain("provenance");
  });

  it("keeps the six default tiles and hides the other two", () => {
    const settings = defaultShareSettings();
    expect(settings.visibleTiles).toEqual([
      "clicks",
      "aiAnswers",
      "top10",
      "conversions",
      "topPages",
      "cost",
    ]);
    expect(settings.noindex).toBe(true);
    expect(hiddenTileIds(settings)).toEqual(["activeDays", "existingVsNew"]);
    expect(CHALLENGE_TILE_IDS).toHaveLength(8);
  });
});

describe("share token", () => {
  it("returns a badge-shaped secret and stores only its hash", () => {
    const token = createShareToken();
    expect(token).toMatch(SHARE_TOKEN_PATTERN);
    expect(hashShareToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken(token)).not.toBe(token);
  });
});

describe("share view counting", () => {
  it.each([
    [{ "user-agent": "Mozilla/5.0" }, true],
    [{ "user-agent": "Twitterbot/1.0" }, false],
    [{ purpose: "prefetch", "user-agent": "Mozilla/5.0" }, false],
    [{ "next-router-prefetch": "1" }, false],
    [{ "x-middleware-prefetch": "1" }, false],
  ] as const)("counts %# only for a real visit", (input, expected) => {
    expect(shouldCountShareView(new Headers(input))).toBe(expected);
  });
});

describe("share stages and expiry", () => {
  it("lets performance reports update a link for a legacy report but keeps journeys separate", () => {
    const legacy = { ...sampleChallengeBody(), workScope: undefined };
    const performance = {
      ...legacy,
      period: { ...legacy.period, days: 60, to: "2026-03-01" },
      stage: "day60" as const,
      workScope: "hidden" as const,
    };
    expect(isLaterStage(performance, legacy)).toBe(true);
    expect(
      isLaterStage(performance, {
        ...legacy,
        journey: { calendarDays: 30, workDays: 10, checkIns: 20 },
      }),
    ).toBe(false);
  });

  it("publishes only a later stage from the same start", () => {
    expect(
      isLaterStage(
        { period: { days: 60, from: "2026-01-01", to: "2026-03-01" }, stage: "day60" },
        { period: { days: 30, from: "2026-01-01", to: "2026-01-30" }, stage: "day30" },
      ),
    ).toBe(true);
    const pending = pickPendingUpdate({ from: "2026-01-01", rank: 30 }, [
      {
        createdAt: "2026-02-01T00:00:00.000Z",
        from: "2026-01-01",
        id: "agr_bbbbbbbbbbbbbbbbbbbbbbbb",
        onActiveLink: false,
        rank: 60,
        stage: "day60",
        title: "Day 60",
      },
      {
        createdAt: "2026-03-01T00:00:00.000Z",
        from: "2026-01-01",
        id: "agr_cccccccccccccccccccccccc",
        onActiveLink: true,
        rank: 90,
        stage: "day90",
        title: "Day 90",
      },
    ]);
    expect(pending?.id).toBe("agr_bbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it.each([
    [null, "never"],
    [7, "7"],
    [30, "30"],
    [90, "90"],
  ] as const)("maps a %s day span back to %s", (days, choice) => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    const expires = days === null ? null : new Date(created.getTime() + days * 86_400_000);
    expect(expiryChoice(created, expires)).toBe(choice);
  });
});

describe("share image facts", () => {
  it("uses observed clicks, then the first available visible outcome", () => {
    const body = sampleChallengeBody();
    const withClicks = shareImageCopy(publicReportView(body, defaultShareSettings()));
    expect(withClicks.headline).toBeTruthy();
    expect(withClicks.clickTrend).toHaveLength(body.period.days);
    expect(withClicks.headlineTile).toBe("clicks");
    expect(withClicks.facts).toHaveLength(3);
    const settings = parseShareSettings({ visibleTiles: ["conversions", "cost"] });
    const fallback = shareImageCopy(publicReportView(body, settings));
    expect(fallback.headlineTile).toBe("conversions");
  });
  it("compares ranking counts without assuming an unmeasured baseline was zero", () => {
    const body = sampleChallengeBody();
    const rankingSettings = parseShareSettings({ visibleTiles: ["top10"] });
    body.tiles.top10 = { bestJump: null, startCount: 9, endCount: 9, state: "ok" };
    expect(shareImageCopy(publicReportView(body, rankingSettings))).toMatchObject({
      comparison: { start: "9", latest: "9", delta: 0 },
      headline: "9",
      headlineTile: "top10",
    });
    body.tiles.top10.startCount = 0;
    expect(shareImageCopy(publicReportView(body, rankingSettings)).comparison).toBeUndefined();
    body.tiles.top10.hasStart = true;
    expect(shareImageCopy(publicReportView(body, rankingSettings)).comparison).toEqual({
      start: "0",
      latest: "9",
      delta: 9,
    });
    const hidden = shareImageCopy(publicReportView(body, parseShareSettings({ visibleTiles: [] })));
    expect(hidden.comparison).toBeUndefined();
    expect(hidden.headline).toBe("");
  });
});
