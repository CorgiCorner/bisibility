import type { KeywordRow } from "@/lib/queries/keywords";
import { describe, expect, it, vi } from "vitest";
import { exportHistoryCsv, keywordHistoryCsv } from "./keyword-history-export";

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ui/download", () => ({ downloadTextFile: download }));

type HistoryKeyword = Pick<KeywordRow, "keyword" | "positionHistory" | "completedComparableChecks">;
function fixture() {
  return {
    keyword: '  ="rank, tracker"',
    positionHistory: [
      {
        checkedAt: "2026-10-01T09:00:00.000Z",
        label: "2026-10-01",
        position: 5,
        rankingUrl: 'https://example.com/a?x="a,b"',
      },
      {
        checkedAt: "2026-10-08T09:00:00.000Z",
        label: "2026-10-08",
        position: 3,
        rankingUrl: "https://example.com/b",
      },
    ],
    // This current URL must never replace the URLs recorded by those checks.
    rankingUrl: "https://example.com/today",
  } satisfies HistoryKeyword & {
    rankingUrl: string;
    positionHistory: (KeywordRow["positionHistory"][number] & { rankingUrl: string | null })[];
  };
}

describe("keyword detail CSV", () => {
  it("uses the URL recorded by each check and central quoting/formula protection", () => {
    expect(keywordHistoryCsv(fixture())).toBe(
      [
        "period,keyword,position,ranking_url",
        '2026-10-01,"\'  =""rank, tracker""",5,"https://example.com/a?x=""a,b"""',
        '2026-10-08,"\'  =""rank, tracker""",3,https://example.com/b',
      ].join("\n"),
    );
  });

  it("leaves an explicit null URL empty instead of falling back to another check", () => {
    const row = fixture();
    const point = { ...row.positionHistory[0], rankingUrl: null };
    expect(
      keywordHistoryCsv({
        ...row,
        positionHistory: [point],
        completedComparableChecks: [
          {
            checkedAt: point.checkedAt,
            position: point.position,
            rankingUrl: "https://example.com/other",
          },
        ],
      }),
    ).toBe('period,keyword,position,ranking_url\n2026-10-01,"\'  =""rank, tracker""",5,');
  });

  it("matches legacy points only to an unambiguous same-time same-position check", () => {
    const point = { checkedAt: "2026-10-01T09:00:00.000Z", label: "2026-10-01", position: 5 };
    const row = {
      keyword: "rank tracker",
      positionHistory: [point],
      completedComparableChecks: [
        { checkedAt: point.checkedAt, position: 5, rankingUrl: "https://example.com/a" },
      ],
    };
    expect(keywordHistoryCsv(row)).toContain(",5,https://example.com/a");
    expect(
      keywordHistoryCsv({
        ...row,
        completedComparableChecks: [{ ...row.completedComparableChecks[0], position: 3 }],
      }),
    ).toBe("period,keyword,position,ranking_url\n2026-10-01,rank tracker,5,");
    expect(
      keywordHistoryCsv({
        ...row,
        completedComparableChecks: [
          ...row.completedComparableChecks,
          { ...row.completedComparableChecks[0], rankingUrl: "https://example.com/ambiguous" },
        ],
      }),
    ).toBe("period,keyword,position,ranking_url\n2026-10-01,rank tracker,5,");
  });

  it("retains header-only output for empty history and never substitutes today's URL", () => {
    expect(keywordHistoryCsv({ keyword: "rank tracker", positionHistory: [] })).toBe(
      "period,keyword,position,ranking_url",
    );
    expect(
      keywordHistoryCsv({
        keyword: "rank tracker",
        positionHistory: [{ checkedAt: "2026-10-01", label: "2026-10-01", position: 5 }],
      }),
    ).toBe("period,keyword,position,ranking_url\n2026-10-01,rank tracker,5,");
  });

  it("uses a controlled filename without path separators or control characters", () => {
    exportHistoryCsv({ keyword: "../folder\\name\r\n", positionHistory: [] });
    expect(download).toHaveBeenLastCalledWith(
      "period,keyword,position,ranking_url",
      "folder-name-history.csv",
      "text/csv;charset=utf-8",
    );
  });

  it("downloads the centrally serialized history without touching the original row", () => {
    const row = fixture();
    const before = structuredClone(row);
    exportHistoryCsv(row);
    expect(download).toHaveBeenCalledWith(
      keywordHistoryCsv(row),
      expect.stringMatching(/-history\.csv$/),
      "text/csv;charset=utf-8",
    );
    expect(row).toEqual(before);
  });
});
