import { describe, expect, it } from "vitest";
import {
  dataForSeoDomainOverview,
  dataForSeoHistoricalOverview,
  dataForSeoLabsSourceSnapshotAt,
  dataForSeoRelevantPages,
} from "./dataforseo-domain-payload";
import historyEmpty from "./fixtures/domain-overview/history-empty-40501.json";
import historyMalformed from "./fixtures/domain-overview/history-malformed.json";
import historySuccess from "./fixtures/domain-overview/history-success.json";
import overviewEmpty from "./fixtures/domain-overview/overview-empty.json";
import overviewNoOrganic from "./fixtures/domain-overview/overview-no-organic.json";
import overviewSuccess from "./fixtures/domain-overview/overview-success.json";
import pagesEmpty from "./fixtures/domain-overview/pages-empty-40501.json";
import pagesMalformed from "./fixtures/domain-overview/pages-malformed.json";
import pagesNoTotalCount from "./fixtures/domain-overview/pages-no-total-count.json";
import pagesSuccess from "./fixtures/domain-overview/pages-success.json";

const expectedMetrics = {
  count: 1820,
  etv: 15420.5,
  estimatedTrafficCostCents: 3312875,
  isDown: 30,
  isLost: 15,
  isNew: 25,
  isUp: 40,
  pos1: 12,
  pos11_20: 210,
  pos21_30: 180,
  pos2_3: 34,
  pos31_40: 150,
  pos41_50: 140,
  pos4_10: 120,
  pos51_60: 130,
  pos61_70: 120,
  pos71_80: 110,
  pos81_90: 100,
  pos91_100: 90,
};

describe("DataForSEO domain overview payload parsers", () => {
  it("maps organic metrics, converts cost to cents, and ignores paid metrics", () => {
    expect(dataForSeoDomainOverview(overviewSuccess)).toEqual({
      costCents: 2,
      metrics: expectedMetrics,
      sourceSnapshotAt: null,
    });
  });

  it("returns metrics: null when the overview items are empty (no_data contract)", () => {
    expect(dataForSeoDomainOverview(overviewEmpty)).toEqual({
      costCents: 2,
      metrics: null,
      sourceSnapshotAt: null,
    });
  });

  it("returns metrics: null when organic metrics are absent", () => {
    expect(dataForSeoDomainOverview(overviewNoOrganic)).toEqual({
      costCents: 2,
      metrics: null,
      sourceSnapshotAt: null,
    });
  });

  it("maps the Labs Google source snapshot date to a UTC instant", () => {
    expect(
      dataForSeoLabsSourceSnapshotAt({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [{ google: { date_update: "2026-08-04" } }],
          },
        ],
      }),
    ).toBe("2026-08-04T00:00:00.000Z");
  });

  it.each(["2026-02-30", "2026-08-04T12:00:00Z", " 2026-08-04 ", 20260804, null])(
    "returns null for an invalid Labs source date: %s",
    (dateUpdate) => {
      expect(
        dataForSeoLabsSourceSnapshotAt({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: [{ google: { date_update: dateUpdate } }],
            },
          ],
        }),
      ).toBeNull();
    },
  );

  it("returns null when the Labs Google source date is absent", () => {
    expect(
      dataForSeoLabsSourceSnapshotAt({
        status_code: 20000,
        tasks: [{ status_code: 20000, result: [{}] }],
      }),
    ).toBeNull();
  });

  it("propagates a Labs Status provider error", () => {
    expect(() =>
      dataForSeoLabsSourceSnapshotAt({
        status_code: 50000,
        status_message: "Internal error",
      }),
    ).toThrow("Internal error");
  });

  it("maps valid history rows", () => {
    const result = dataForSeoHistoricalOverview(historySuccess);
    expect(result.costCents).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      year: 2025,
      month: 7,
      metrics: {
        count: 1600,
        etv: 12000.0,
        estimatedTrafficCostCents: 2500000,
        isDown: 25,
        isLost: 10,
        isNew: 20,
        isUp: 35,
        pos1: 10,
        pos11_20: 190,
        pos21_30: 170,
        pos2_3: 28,
        pos31_40: 140,
        pos41_50: 130,
        pos4_10: 100,
        pos51_60: 120,
        pos61_70: 110,
        pos71_80: 100,
        pos81_90: 90,
        pos91_100: 80,
      },
    });
    expect(result.rows[1]).toEqual({ year: 2025, month: 8, metrics: expectedMetrics });
  });

  it("drops history rows with invalid year, invalid month, or missing organic metrics", () => {
    const result = dataForSeoHistoricalOverview(historyMalformed);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.year).toBe(2025);
    expect(result.rows[0]?.month).toBe(7);
    expect(result.rows[1]?.year).toBe(2025);
    expect(result.rows[1]?.month).toBe(8);
  });

  it("returns empty history on 40501", () => {
    expect(dataForSeoHistoricalOverview(historyEmpty)).toEqual({ costCents: 2, rows: [] });
  });

  it("maps relevant pages with trimmed path, etv, keywordCount, and null top-keyword fields", () => {
    const result = dataForSeoRelevantPages(pagesSuccess);
    expect(result.consumedCount).toBe(2);
    expect(result.costCents).toBe(2);
    expect(result.totalCount).toBe(142);
    expect(result.rows).toEqual([
      {
        path: "/",
        etv: 8200.5,
        keywordCount: 520,
        topKeyword: null,
        topKeywordPosition: null,
        etvDeltaPct: null,
      },
      {
        path: "/products/widget",
        etv: 4200.0,
        keywordCount: 310,
        topKeyword: null,
        topKeywordPosition: null,
        etvDeltaPct: null,
      },
    ]);
  });

  it("drops relevant-page rows with blank page_address or missing organic metrics", () => {
    const result = dataForSeoRelevantPages(pagesMalformed);
    expect(result.consumedCount).toBe(4);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.path).toBe("/");
    expect(result.rows[1]?.path).toBe("/blog/post");
  });

  it("drops a whitespace-only page address", () => {
    expect(
      dataForSeoRelevantPages({
        status_code: 20000,
        tasks: [
          {
            cost: 0.01,
            status_code: 20000,
            result: [{ items: [{ page_address: "   ", metrics: { organic: { count: 1 } } }] }],
          },
        ],
      }).rows,
    ).toEqual([]);
  });

  it("falls back totalCount to 0 when total_count is missing or non-integer", () => {
    const result = dataForSeoRelevantPages(pagesNoTotalCount);
    expect(result.consumedCount).toBe(1);
    expect(result.totalCount).toBe(0);
    expect(result.rows).toHaveLength(1);
  });

  it("returns empty pages on 40501 with totalCount 0", () => {
    expect(dataForSeoRelevantPages(pagesEmpty)).toEqual({
      consumedCount: 0,
      costCents: 2,
      rows: [],
      totalCount: 0,
    });
  });
});
