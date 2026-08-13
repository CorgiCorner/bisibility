import { describe, expect, it } from "vitest";
import type { CheckRunsSummary } from "./runs-view";
import {
  buildCheckRunsView,
  buildProviderHealth,
  type CheckRunSource,
  checkRangeStart,
} from "./runs-view";

const NOW = new Date("2026-07-24T12:00:00.000Z");

function source(overrides: Partial<CheckRunSource> = {}): CheckRunSource {
  return {
    attemptCount: 1,
    attempts: null,
    checkedAt: new Date("2026-07-24T10:00:00.000Z"),
    costCents: 0.2,
    degradedToCountry: false,
    error: null,
    estimatedCostCents: 0.3,
    finishedAt: new Date("2026-07-24T10:00:02.000Z"),
    publicId: "check_abcdefghijklmnopqrstuvwx",
    keyword: {
      publicId: "kw_abcdefghijklmnopqrstuvwx",
      text: "rank tracker",
      device: "desktop",
      locationRef: { displayName: "San Francisco, California, US", languageLabel: "English" },
    },
    position: 4,
    previousPosition: 6,
    provider: "dataforseo",
    requestedDepth: 10,
    startedAt: new Date("2026-07-24T10:00:00.000Z"),
    status: "completed",
    trigger: "scheduled",
    viaFallback: false,
    ...overrides,
  };
}

const summary: CheckRunsSummary = {
  counts: {
    completed: 3,
    deferred: 1,
    failed: 1,
    running: 0,
    runs: 4,
    viaFallback: 1,
  },
  deferredGroups: [],
  providerHealth: [],
  spendCents: 0.5,
};

describe("checks runs view", () => {
  it("uses rolling range windows", () => {
    expect(checkRangeStart("24h", NOW).toISOString()).toBe("2026-07-23T12:00:00.000Z");
    expect(checkRangeStart("7d", NOW).toISOString()).toBe("2026-07-17T12:00:00.000Z");
    expect(checkRangeStart("30d", NOW).toISOString()).toBe("2026-06-24T12:00:00.000Z");
  });

  it("assembles one bounded page from denormalized row facts", () => {
    const view = buildCheckRunsView(
      [
        source({
          attemptCount: 2,
          attempts: [{ message: "Provider rate limited (429)", provider: "dataforseo" }],
          costCents: null,
          degradedToCountry: true,
          estimatedCostCents: 0.4,
          provider: "serpapi",
          viaFallback: true,
        }),
      ],
      summary,
      { limit: 2 },
    );

    expect(view.rows[0]).toMatchObject({
      attemptCount: 2,
      degradedToCountry: true,
      durationMs: 2_000,
      provider: "serpapi",
      viaFallback: true,
    });
    expect(view.counts).toBe(summary.counts);
    expect(view.spendCents).toBe(0.5);
  });

  it("maps keyword market fields from the location relation without defaults", () => {
    const view = buildCheckRunsView(
      [
        source({
          keyword: {
            publicId: "kw_a",
            text: "rank tracker",
            device: "mobile",
            locationRef: { displayName: "London, UK", languageLabel: "English" },
          },
        }),
        source({
          keyword: {
            publicId: "kw_b",
            text: "rank tracker",
            device: "desktop",
            locationRef: { displayName: "Berlin, DE", languageLabel: "German" },
          },
        }),
      ],
      summary,
      { limit: 10 },
    );

    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]).toMatchObject({
      location: "London, UK",
      languageLabel: "English",
      device: "mobile",
    });
    expect(view.rows[1]).toMatchObject({
      location: "Berlin, DE",
      languageLabel: "German",
      device: "desktop",
    });
  });

  it("builds provider health from grouped completions and bounded attempt candidates", () => {
    expect(
      buildProviderHealth(
        [
          { _count: { _all: 4 }, provider: "dataforseo", viaFallback: false },
          { _count: { _all: 1 }, provider: "serpapi", viaFallback: true },
        ],
        [
          {
            attempts: [{ message: "Provider rate limited (429)", provider: "dataforseo" }],
            provider: "serpapi",
            status: "completed",
          },
          { attempts: null, provider: "custom", status: "failed" },
        ],
        [{ provider: "dataforseo" }, { provider: "serpapi" }],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direct: 4,
          isPrimary: true,
          provider: "dataforseo",
          rateLimited: 1,
        }),
        expect.objectContaining({
          coveredAsFallback: 1,
          provider: "serpapi",
        }),
        expect.objectContaining({ failed: 1, provider: "custom" }),
      ]),
    );
  });

  it("uses the extra fetched row for exact checkedAt and id cursor edges", () => {
    const first = buildCheckRunsView(
      [
        source({ publicId: "check_cabcdefghijklmnopqrstuvw" }),
        source({ publicId: "check_babcdefghijklmnopqrstuvw" }),
        source({ publicId: "check_aabcdefghijklmnopqrstuvw" }),
      ],
      summary,
      { limit: 2 },
    );
    const second = buildCheckRunsView(
      [source({ publicId: "check_aabcdefghijklmnopqrstuvw" })],
      summary,
      { limit: 2 },
    );

    expect(first.rows.map((row) => row.id)).toEqual([
      "check_cabcdefghijklmnopqrstuvw",
      "check_babcdefghijklmnopqrstuvw",
    ]);
    expect(first.nextCursor).toEqual({
      checkedAt: "2026-07-24T10:00:00.000Z",
      id: "check_babcdefghijklmnopqrstuvw",
    });
    expect(second.rows.map((row) => row.id)).toEqual(["check_aabcdefghijklmnopqrstuvw"]);
    expect(second.nextCursor).toBeNull();
  });
});
