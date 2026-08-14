export type OverviewRange = "7d" | "28d" | "90d";
export type OverviewDevice = "all" | "desktop" | "mobile";
export type OverviewFilters = {
  device: OverviewDevice;
  marketIds: string[];
  range: OverviewRange;
  tag: string | null;
};

export const overviewRangeLabels = {
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  "90d": "Last 90 days",
} as const;

const rangeDays = { "7d": 7, "28d": 28, "90d": 90 } as const;

function dayStart(now: Date, days: number) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - days + 1);
  return start;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function marketParams(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      values
        .flatMap((item) => item.split(","))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);
}

export function normalizeOverviewFilters(input: Partial<OverviewFilters> = {}): OverviewFilters {
  const device = input.device === "desktop" || input.device === "mobile" ? input.device : "all";
  const range = input.range && input.range in overviewRangeLabels ? input.range : ("28d" as const);
  const tag = input.tag?.trim() ? input.tag.trim().slice(0, 48) : null;
  const marketIds = marketParams(input.marketIds);
  return { device, marketIds, range, tag };
}

export function parseOverviewFilters(
  params: Record<string, string | string[] | undefined> | undefined,
): OverviewFilters {
  return normalizeOverviewFilters({
    device: firstParam(params?.device)?.toLowerCase() as OverviewDevice | undefined,
    marketIds: marketParams(params?.market),
    range: firstParam(params?.range) as OverviewRange | undefined,
    tag: firstParam(params?.tag) ?? null,
  });
}

export function overviewRangeStart(now: Date, range: OverviewRange) {
  return dayStart(now, rangeDays[range]);
}

export function overviewCheckStart(now: Date, range: OverviewRange) {
  return new Date(Math.min(overviewRangeStart(now, range).getTime(), dayStart(now, 30).getTime()));
}

export function overviewKeywordWhere(projectId: string, filters: OverviewFilters) {
  return {
    projectId,
    ...(filters.device === "all" ? {} : { device: filters.device }),
    ...(filters.marketIds.length ? { locationId: { in: filters.marketIds } } : {}),
    locationRef: {
      projectMarkets: { some: { projectId, status: "active" as const } },
    },
    ...(filters.tag ? { tags: { some: { tag: { name: filters.tag } } } } : {}),
  };
}
