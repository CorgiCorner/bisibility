import type { KeywordLocation, KeywordRow } from "@/lib/queries/keywords";
import { describe, expect, it } from "vitest";
import {
  applyLens,
  DEFAULT_LENS_DEVICE,
  lensHref,
  lensLocationOptions,
  resolveActiveLens,
  resolveDefaultLensDevice,
} from "./lens-model";

function loc(overrides: Partial<KeywordLocation> = {}): KeywordLocation {
  return {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "loc_us",
    kind: "country",
    ...overrides,
  };
}

function row(overrides: Partial<KeywordRow> = {}): KeywordRow {
  const location = overrides.location ?? loc();
  return {
    bestPosition: 1,
    cpc: "0.00",
    createdAt: "2026-01-01T00:00:00.000Z",
    device: "Desktop",
    difficulty: 0,
    engine: "Google",
    hasRankData: true,
    id: "kw_1",
    keyword: "rank tracker",
    lastCheckAt: null,
    lastCheckStatus: null,
    location,
    locationName: location.displayName,
    position: 1,
    positionHistory: [],
    previousPosition: 1,
    rankingPages: 1,
    rankingPath: "/",
    rankingUrl: "https://example.com/",
    rankingUrlHistory: [],
    schedule: {
      cron_expression: null,
      frequency: "daily",
      jitter_minutes: 60,
      last_checked_at: null,
      next_check_at: null,
      timezone: "UTC",
    },
    serpFeatures: [],
    sparkline: [],
    tags: [],
    targetUrl: null,
    topic: null,
    intent: null,
    volume: 0,
    ...overrides,
    clicks: overrides.clicks ?? null,
    ctr: overrides.ctr ?? null,
    impressions: overrides.impressions ?? null,
    positionBaseline: overrides.positionBaseline === undefined ? 1 : overrides.positionBaseline,
    positionHistoryBoundaryAt: overrides.positionHistoryBoundaryAt ?? null,
  };
}

const austin = loc({
  canonicalKey: "US/Texas/Austin",
  cityName: "Austin",
  displayName: "Austin, Texas, United States",
  id: "loc_austin",
  kind: "city",
});

describe("resolveActiveLens", () => {
  it("defaults device and location when params are absent", () => {
    expect(resolveActiveLens({})).toEqual({ device: DEFAULT_LENS_DEVICE, locationId: null });
  });

  it("keeps mobile when every keyword row explicitly uses mobile", () => {
    expect(resolveActiveLens({}, [row({ device: "Mobile" })])).toEqual({
      device: "mobile",
      locationId: null,
    });
  });

  it("defaults to all devices for mixed device rows", () => {
    expect(resolveDefaultLensDevice([row({ id: "a", device: "Mobile" }), row({ id: "b" })])).toBe(
      "all",
    );
  });

  it("resolves mixed device rows to all devices when params are absent", () => {
    expect(resolveActiveLens({}, [row({ id: "a", device: "Mobile" }), row({ id: "b" })])).toEqual({
      device: "all",
      locationId: null,
    });
  });

  it("defaults to desktop when every keyword row is desktop", () => {
    expect(resolveDefaultLensDevice([row({ id: "a" }), row({ id: "b" })])).toBe("desktop");
  });

  it("defaults to mobile when every keyword row is mobile", () => {
    expect(
      resolveDefaultLensDevice([
        row({ id: "a", device: "Mobile" }),
        row({ id: "b", device: "Mobile" }),
      ]),
    ).toBe("mobile");
  });

  it("uses the constant default when rows are empty", () => {
    expect(resolveDefaultLensDevice()).toBe(DEFAULT_LENS_DEVICE);
  });

  it("degrades an unknown device to the default without throwing", () => {
    expect(resolveActiveLens({ device: "tablet", location: "loc_us" })).toEqual({
      device: "desktop",
      locationId: "loc_us",
    });
  });

  it("normalizes device casing and reads mobile", () => {
    expect(resolveActiveLens({ device: "Mobile" }).device).toBe("mobile");
  });

  it("preserves an explicit all-devices lens", () => {
    expect(resolveActiveLens({ device: "all" }).device).toBe("all");
  });
});

describe("lensLocationOptions", () => {
  it("returns distinct locations ordered by tracked count", () => {
    const rows = [
      row({ id: "a", location: loc() }),
      row({ id: "b", location: loc() }),
      row({ id: "c", location: austin }),
    ];
    const options = lensLocationOptions(rows);
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ count: 2, id: "loc_us" });
    expect(options[1]).toMatchObject({ count: 1, id: "loc_austin", kind: "city" });
  });
});

describe("applyLens", () => {
  const rows = [
    row({ id: "a", device: "Desktop", location: loc() }),
    row({ id: "b", device: "Mobile", location: loc() }),
    row({ id: "c", device: "Desktop", location: austin }),
  ];

  it("filters by device only when location is null", () => {
    const result = applyLens(rows, { device: "desktop", locationId: null });
    expect(result.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("filters by both device and location when a location is set", () => {
    const result = applyLens(rows, { device: "desktop", locationId: "loc_austin" });
    expect(result.map((item) => item.id)).toEqual(["c"]);
  });

  it("keeps every device when the all-devices lens is active", () => {
    const result = applyLens(rows, { device: "all", locationId: null });
    expect(result.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});

describe("lensHref", () => {
  it("serializes default device and null location", () => {
    expect(lensHref("/app/keywords", { device: "desktop", locationId: null })).toBe(
      "/app/keywords?device=desktop",
    );
  });

  it("serializes location, non-default device and view id", () => {
    const href = lensHref("/app/keywords", { device: "mobile", locationId: "loc_us" }, "view_1");
    expect(href).toContain("location=loc_us");
    expect(href).toContain("device=mobile");
    expect(href).toContain("view=view_1");
  });

  it("serializes all-devices as an explicit lens", () => {
    expect(lensHref("/app/keywords", { device: "all", locationId: null })).toBe(
      "/app/keywords?device=all",
    );
  });
});
