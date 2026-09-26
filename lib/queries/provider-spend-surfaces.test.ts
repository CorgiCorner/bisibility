import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  monthLabel,
  projectedExhaustionAt,
  surfaceSpend,
  surfaceTightestEntries,
  worseSurfaceState,
} from "./provider-spend-surfaces";

const now = new Date("2026-08-20T12:00:00.000Z");

describe("surfaceSpend", () => {
  it("derives the capped state and remaining budget from a reached cap", () => {
    expect(
      surfaceSpend({
        allocation: { amountPerMonth: 100, unit: "units" },
        now,
        requestCount: 4,
        used: 100,
      }),
    ).toEqual({
      allocation: { amountPerMonth: 100, unit: "units" },
      projectedExhaustionAt: "2026-08-21T00:00:00.000Z",
      remaining: 0,
      requestCount: 4,
      state: "capped",
      unconfirmedCount: 0,
      used: 100,
      usedPercent: 100,
    });
  });

  it("reports a null-cap surface as no_allocation without a percentage", () => {
    expect(surfaceSpend({ allocation: null, now, requestCount: 0, used: 40 })).toEqual({
      allocation: null,
      projectedExhaustionAt: null,
      remaining: null,
      requestCount: 0,
      state: "no_allocation",
      unconfirmedCount: 0,
      used: 40,
      usedPercent: null,
    });
  });

  it("carries unconfirmed coverage so a partial confirmed sum is never final", () => {
    const spend = surfaceSpend({
      allocation: { amountPerMonth: 100, unit: "units" },
      now,
      requestCount: 7,
      unconfirmedCount: 2,
      used: 5,
    });

    expect(spend).toMatchObject({ remaining: 95, unconfirmedCount: 2, used: 5 });
  });

  it("clamps the used percentage at 100 for over-cap spend", () => {
    const spend = surfaceSpend({
      allocation: { amountPerMonth: 100, unit: "cents" },
      now,
      requestCount: 3,
      used: 250,
    });
    expect(spend.state).toBe("capped");
    expect(spend.usedPercent).toBe(100);
    expect(spend.remaining).toBe(-150);
  });

  it("keeps a below-cap surface ok with an exhaustion projection only over pace", () => {
    expect(
      surfaceSpend({
        allocation: { amountPerMonth: 9_000, unit: "cents" },
        now,
        requestCount: 2,
        used: 900,
      }),
    ).toEqual({
      allocation: { amountPerMonth: 9_000, unit: "cents" },
      projectedExhaustionAt: null,
      remaining: 8_100,
      requestCount: 2,
      state: "ok",
      unconfirmedCount: 0,
      used: 900,
      usedPercent: 10,
    });
  });
});

describe("projectedExhaustionAt", () => {
  it("projects the exhaustion date for over-pace usage", () => {
    expect(projectedExhaustionAt({ amountPerMonth: 100, unit: "cents" }, 900, now)).toBe(
      "2026-08-03T05:20:00.000Z",
    );
  });

  it("returns null without a cap or for on-pace usage", () => {
    expect(projectedExhaustionAt(null, 900, now)).toBeNull();
    expect(projectedExhaustionAt({ amountPerMonth: 500_000, unit: "cents" }, 900, now)).toBeNull();
  });
});

describe("worseSurfaceState", () => {
  it("takes the worse of the two surfaces without letting an uncapped one drag the row down", () => {
    const app = surfaceSpend({
      allocation: { amountPerMonth: 100, unit: "cents" },
      now,
      requestCount: 1,
      used: 90,
    });
    const programmatic = surfaceSpend({
      allocation: { amountPerMonth: 100, unit: "cents" },
      now,
      requestCount: 1,
      used: 100,
    });
    expect(worseSurfaceState({ app, programmatic })).toBe("capped");
    expect(
      worseSurfaceState({
        app,
        programmatic: { ...programmatic, used: 10, usedPercent: 10, state: "ok" },
      }),
    ).toBe("ok");
    expect(
      worseSurfaceState({
        app: { ...app, allocation: null, usedPercent: null, state: "no_allocation" },
        programmatic,
      }),
    ).toBe("capped");
    expect(
      worseSurfaceState({
        app,
        programmatic: {
          ...programmatic,
          allocation: null,
          usedPercent: null,
          state: "no_allocation",
        },
      }),
    ).toBe("ok");
  });
});

describe("surfaceTightestEntries", () => {
  it("lists one entry per capped surface and skips uncapped surfaces", () => {
    const app = surfaceSpend({
      allocation: { amountPerMonth: 100, unit: "cents" },
      now,
      requestCount: 1,
      used: 90,
    });
    const programmatic = surfaceSpend({
      allocation: { amountPerMonth: 100, unit: "cents" },
      now,
      requestCount: 1,
      used: 100,
    });
    const creditsApp = surfaceSpend({
      allocation: { amountPerMonth: 100, unit: "cents" },
      now,
      requestCount: 1,
      used: 40,
    });
    const row = {
      connectionId: "conn_a",
      provider: "Data",
      surfaces: { app, programmatic },
    };
    expect(surfaceTightestEntries(row, "own")).toEqual([
      { connectionId: "conn_a", provider: "Data", source: "own", surface: "app", usedPercent: 90 },
      {
        connectionId: "conn_a",
        provider: "Data",
        source: "own",
        surface: "programmatic",
        usedPercent: 100,
      },
    ]);
    expect(
      surfaceTightestEntries({ ...row, surfaces: { app: creditsApp, programmatic } }, "credits"),
    ).toEqual([
      {
        connectionId: "conn_a",
        provider: "Data",
        source: "credits",
        surface: "app",
        usedPercent: 40,
      },
      {
        connectionId: "conn_a",
        provider: "Data",
        source: "credits",
        surface: "programmatic",
        usedPercent: 100,
      },
    ]);
    expect(
      surfaceTightestEntries(
        {
          connectionId: "conn_b",
          provider: "Data",
          surfaces: {
            app,
            programmatic: {
              ...programmatic,
              allocation: null,
              usedPercent: null,
              state: "no_allocation",
            },
          },
        },
        "own",
      ),
    ).toEqual([
      { connectionId: "conn_b", provider: "Data", source: "own", surface: "app", usedPercent: 90 },
    ]);
  });
});

describe("monthLabel", () => {
  it("labels a UTC month", () => {
    expect(monthLabel(new Date("2026-08-20T12:00:00.000Z"))).toBe("August 2026");
  });
});
