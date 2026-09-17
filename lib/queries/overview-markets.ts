import type { OverviewRange } from "./overview-filters";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<OverviewRange, number> = { "7d": 7, "28d": 28, "90d": 90 };
const TREND_POINTS = 8;

type MarketCheck = {
  checkedAt: Date;
  position: number | null;
  status: string;
};

export type OverviewMarketKeyword = {
  id: string;
  locationId: string;
  locationRef: {
    countryCode?: string | null;
    displayName: string;
    languageCode?: string | null;
    languageLabel: string;
  };
  rankChecks: MarketCheck[];
  schedule: { frequency: string } | null;
};

export type OverviewMarketRow = {
  countryCode?: string | null;
  deltaPoints: number;
  languageCode?: string | null;
  languageLabel: string;
  locationId: string;
  locationLabel: string;
  previousPeriod: { end: string; start: string };
  rangeDays: number;
  researchAvailable: boolean;
  targetCount: number;
  top10Count: number;
  top10Share: number;
  trend: number[];
};

export type OverviewRegistryMarket = {
  location: {
    countryCode?: string | null;
    displayName: string;
    languageCode?: string | null;
    languageLabel: string;
  };
  locationId: string;
  researchAvailable?: boolean;
};

type BuildOptions = {
  defaultFrequency?: string | null;
  now: Date;
  range: OverviewRange;
};

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function currentPeriodStart(now: Date, days: number) {
  return new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
}

export function overviewMarketHistoryStart(now: Date, range: OverviewRange) {
  const days = RANGE_DAYS[range];
  return new Date(currentPeriodStart(now, days).getTime() - days * DAY_MS);
}

function validPosition(check: MarketCheck | undefined) {
  const position = check?.position;
  return check?.status === "completed" && typeof position === "number" && position > 0
    ? position
    : null;
}

function latestAtOrBefore(checks: MarketCheck[], at: Date, after?: Date) {
  return checks
    .filter(
      (check) =>
        check.status === "completed" &&
        check.checkedAt <= at &&
        (!after || check.checkedAt >= after),
    )
    .sort((left, right) => right.checkedAt.getTime() - left.checkedAt.getTime())[0];
}

function top10Count(keywords: OverviewMarketKeyword[], at: Date, after?: Date) {
  return keywords.filter((keyword) => {
    const position = validPosition(latestAtOrBefore(keyword.rankChecks, at, after));
    return position !== null && position <= 10;
  }).length;
}

function share(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function trendFor(keywords: OverviewMarketKeyword[], historyStart: Date, start: Date, now: Date) {
  const width = now.getTime() - start.getTime();
  return Array.from({ length: TREND_POINTS }, (_, index) => {
    const at = new Date(start.getTime() + (width * index) / (TREND_POINTS - 1));
    const lowerBound = index === TREND_POINTS - 1 ? start : historyStart;
    return share(top10Count(keywords, at, lowerBound), keywords.length);
  });
}

export function buildOverviewMarkets(
  keywords: OverviewMarketKeyword[],
  registryOrOptions: OverviewRegistryMarket[] | BuildOptions,
  maybeOptions?: BuildOptions,
): OverviewMarketRow[] {
  const options = Array.isArray(registryOrOptions) ? maybeOptions : registryOrOptions;
  if (!options) throw new Error("Overview market build options are required.");
  const { defaultFrequency, now, range } = options;
  const active = keywords.filter(
    (keyword) =>
      keyword.locationId &&
      keyword.locationRef &&
      (keyword.schedule?.frequency ?? defaultFrequency ?? "manual") !== "paused",
  );
  const byLocation = new Map<string, OverviewMarketKeyword[]>();
  for (const keyword of active) {
    const group = byLocation.get(keyword.locationId) ?? [];
    group.push(keyword);
    byLocation.set(keyword.locationId, group);
  }
  const registry: OverviewRegistryMarket[] = Array.isArray(registryOrOptions)
    ? registryOrOptions
    : [...byLocation.entries()].map(([locationId, targets]) => ({
        location: targets[0]?.locationRef ?? {
          displayName: "Unknown market",
          languageLabel: "Unknown language",
        },
        locationId,
      }));

  const days = RANGE_DAYS[range];
  const start = currentPeriodStart(now, days);
  const previousStart = new Date(start.getTime() - days * DAY_MS);
  const previousEnd = new Date(start.getTime() - 1);

  return registry.map(({ location, locationId, researchAvailable = true }) => {
    const targets = byLocation.get(locationId) ?? [];
    const currentTop10 = top10Count(targets, now, start);
    const previousTop10 = top10Count(targets, previousEnd, previousStart);
    const currentShare = share(currentTop10, targets.length);
    const previousShare = share(previousTop10, targets.length);
    const deltaPoints = currentShare - previousShare;
    const locationLabel = location.displayName;
    const languageLabel = location.languageLabel;

    return {
      countryCode: location.countryCode ?? null,
      deltaPoints,
      languageCode: location.languageCode ?? null,
      languageLabel,
      locationId,
      locationLabel,
      previousPeriod: {
        end: dateKey(previousEnd),
        start: dateKey(previousStart),
      },
      rangeDays: days,
      researchAvailable,
      targetCount: targets.length,
      top10Count: currentTop10,
      top10Share: currentShare,
      trend: trendFor(targets, previousStart, start, now),
    };
  });
}
