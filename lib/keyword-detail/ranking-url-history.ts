import { RANK_CHECK_STATUS } from "@/lib/checks/status";

export type RankingUrlPeriodNote = "Current" | "First seen ranking" | "URL switched";

export type RankingUrlHistoryCheck = {
  checkedAt: Date;
  position: number | null;
  rankingUrl: string | null;
  requestedDepth?: number | null;
  status?: string;
};

export type RankingUrlPeriod = {
  endAt: Date;
  isCurrent: boolean;
  note: RankingUrlPeriodNote | null;
  position: number | null;
  requestedDepth: number | null;
  startAt: Date;
  url: string;
};

type PeriodRange = Omit<RankingUrlPeriod, "note">;

function periodNote(
  periods: readonly PeriodRange[],
  index: number,
  isCurrent: boolean,
): RankingUrlPeriodNote | null {
  if (index === 0) return "First seen ranking";
  if (isCurrent) return "Current";
  return periods[index - 1]?.url === periods[index]?.url ? null : "URL switched";
}

/**
 * Groups completed ranking observations into consecutive URL periods.
 * Missing URLs close a period so a later reappearance starts a new one.
 */
export function deriveRankingUrlPeriods(
  checks: readonly RankingUrlHistoryCheck[],
): RankingUrlPeriod[] {
  const chronological = checks
    .filter((check) => check.status === undefined || check.status === RANK_CHECK_STATUS.COMPLETED)
    .slice()
    .sort((left, right) => left.checkedAt.getTime() - right.checkedAt.getTime());
  const periods: PeriodRange[] = [];
  let current: PeriodRange | null = null;

  for (const check of chronological) {
    if (!check.rankingUrl) {
      current = null;
      continue;
    }
    if (!current || current.url !== check.rankingUrl) {
      current = {
        endAt: check.checkedAt,
        isCurrent: false,
        position: check.position,
        requestedDepth: check.requestedDepth ?? null,
        startAt: check.checkedAt,
        url: check.rankingUrl,
      };
      periods.push(current);
      continue;
    }
    current.endAt = check.checkedAt;
    current.position = check.position;
    current.requestedDepth = check.requestedDepth ?? null;
  }

  const latestUrl = chronological.at(-1)?.rankingUrl ?? null;
  return periods.map((period, index) => {
    const isCurrent = latestUrl === period.url && index === periods.length - 1;
    return { ...period, isCurrent, note: periodNote(periods, index, isCurrent) };
  });
}
