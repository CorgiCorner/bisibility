import type { RankingUrlEvent } from "@/lib/queries/keyword-row-types";

type UrlHistoryFixture = {
  idNumber: number;
  position: number;
  rankingPath: string;
  sparkline: readonly number[];
};

export function buildUrlHistory(row: UrlHistoryFixture): RankingUrlEvent[] {
  const alternate = row.rankingPath === "/" ? "/features/rank-tracking" : "/";
  return [
    {
      endAt: "2026-05-12T08:00:00.000Z",
      isCurrent: false,
      note: "First seen ranking",
      position: row.sparkline[3] ?? null,
      requestedDepth: 100,
      startAt: "2026-04-20T08:00:00.000Z",
      url: `https://acme.dev/blog/${row.idNumber}`,
    },
    {
      endAt: "2026-06-02T08:00:00.000Z",
      isCurrent: false,
      note: "URL switched",
      position: row.sparkline[7] ?? null,
      requestedDepth: 100,
      startAt: "2026-05-12T08:00:00.000Z",
      url: `https://acme.dev${alternate}`,
    },
    {
      endAt: "2026-06-18T08:00:00.000Z",
      isCurrent: true,
      note: "Current",
      position: row.position,
      requestedDepth: 100,
      startAt: "2026-06-02T08:00:00.000Z",
      url: `https://acme.dev${row.rankingPath}`,
    },
  ];
}
