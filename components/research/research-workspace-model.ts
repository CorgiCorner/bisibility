import type { TrackingConfigurationValue } from "@/components/keywords/add/TrackingConfigurationFields";
import type { LocationFieldValue } from "@/components/keywords/LocationField";
import { countryValueForCode } from "@/components/keywords/location-picker-data";
import type { addKeywords } from "@/lib/actions/keyword";
import type {
  ResearchKeywordsAction,
  ResearchKeywordsActionInput,
} from "@/lib/actions/keyword-research";
import type { removeSavedKeywords, saveKeywords } from "@/lib/actions/saved-keyword";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import {
  cacheTimeRemaining,
  type RecentKeywordResearch,
} from "@/lib/keyword-research/recent-searches";
import type {
  KeywordResearchMode,
  KeywordResearchOutcome,
  KeywordResearchSuccess,
} from "@/lib/keyword-research/types";
import type { CheckHealth } from "@/lib/queries/check-health";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { getKeywordResearchPageContext } from "@/lib/queries/keyword-research";
import type { SaveKeywordsInput } from "@/lib/schemas/saved-keyword";
import type { ResearchEstimateView } from "./ResearchSearchCard";
import type { ResearchState } from "./ResearchStatePanel";

type PageContext = Awaited<ReturnType<typeof getKeywordResearchPageContext>>;

export type ResearchWorkspaceProps = {
  addKeywordsAction: typeof addKeywords;
  canDeleteSavedKeywords: boolean;
  checkHealth: CheckHealth;
  context: PageContext;
  costContext: ProjectCostContext;
  prefill?: { locationKey?: string; seed: string };
  removeSavedKeywordsAction: typeof removeSavedKeywords;
  researchAction: ResearchKeywordsAction;
  saveKeywordsAction: typeof saveKeywords;
};

export const EMPTY_RESEARCH_ESTIMATE: ResearchEstimateView = {
  cached: false,
  costCents: null,
  loading: false,
};

export function researchRetryLabel(estimate: ResearchEstimateView) {
  if (estimate.cached) return "Retry free, cached";
  return estimate.costCents == null ? "Retry" : `Retry ~${formatEstimateCents(estimate.costCents)}`;
}

export function actualResearchCostCents(result: KeywordResearchSuccess) {
  return result.sources.reduce(
    (total, source) => total + (source.cached ? 0 : source.costCents),
    0,
  );
}

// Bound seed parallelism to limit provider fan-out while avoiding serialized calls.
export const RESEARCH_SEED_CONCURRENCY = 4;

// Preserve input order while bounding concurrent worker calls.
export async function mapWithConcurrency<Item, Result>(
  items: readonly Item[],
  limit: number,
  worker: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  const bound = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: bound }, () => runNext()));
  return results;
}

export async function loadDeeperEstimate(
  action: ResearchKeywordsAction,
  input: ResearchKeywordsActionInput,
  requestedLimit: 100 | 300 | 500,
) {
  if (requestedLimit >= 500) return undefined;
  try {
    const estimated = await action({
      ...input,
      estimateOnly: true,
      resultLimit: requestedLimit === 100 ? 300 : 500,
    });
    return estimated.ok ? { cached: estimated.cached, costCents: estimated.costCents } : undefined;
  } catch {
    return undefined;
  }
}

export async function loadResearchEstimate(
  action: ResearchKeywordsAction,
  input: ResearchKeywordsActionInput,
) {
  try {
    const estimated = await action({ ...input, estimateOnly: true });
    return estimated.ok
      ? { cached: estimated.cached, costCents: estimated.costCents, loading: false }
      : undefined;
  } catch {
    return undefined;
  }
}

export type UiResearchOutcome =
  | KeywordResearchOutcome
  | { charged: boolean | null; ok: false; reason: "lookup_failed" };

export type ResearchTab = {
  connectionId?: string;
  deeperEstimate?: { cached: boolean; costCents: number };
  id: string;
  includeClickstream: boolean;
  location: LocationFieldValue;
  mode: KeywordResearchMode;
  outcome: UiResearchOutcome;
  requestedLimit: 100 | 300 | 500;
  retryEstimate?: ResearchEstimateView;
  seed: string;
};

export function researchTabRequest(
  tab: ResearchTab,
  resultLimit: 100 | 300 | 500 = tab.requestedLimit,
): Partial<ResearchKeywordsActionInput> {
  return {
    connectionId: tab.connectionId,
    includeClickstream: tab.includeClickstream,
    locationKey: tab.location.canonicalKey,
    mode: tab.mode,
    resultLimit,
  };
}

export function focusResearchSeedInput() {
  document.getElementById("research-seed")?.focus();
}

export function markTabsTracked(tabs: readonly ResearchTab[], keywords: string[]): ResearchTab[] {
  const added = new Set(keywords.map((item) => item.trim().toLowerCase()));
  return tabs.map((tab) =>
    tab.outcome.ok
      ? {
          ...tab,
          outcome: {
            ...tab.outcome,
            rows: tab.outcome.rows.map((row) =>
              added.has(row.keyword.trim().toLowerCase()) ? { ...row, alreadyTracked: true } : row,
            ),
          },
        }
      : tab,
  );
}

export function markTabsSaved(
  tabs: readonly ResearchTab[],
  keywords: string[],
  alreadySaved: boolean,
): ResearchTab[] {
  const saved = new Set(keywords.map(researchKeywordIdentity));
  return tabs.map((tab) =>
    tab.outcome.ok
      ? {
          ...tab,
          outcome: {
            ...tab.outcome,
            rows: tab.outcome.rows.map((row) =>
              saved.has(researchKeywordIdentity(row.keyword)) ? { ...row, alreadySaved } : row,
            ),
          },
        }
      : tab,
  );
}

export function researchKeywordIdentity(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Legacy entries lack locationKey and therefore fall back to the project-default market.
export function recentSearchLocation(
  search: Pick<RecentKeywordResearch, "locationKey" | "market">,
  projectDefault: LocationFieldValue,
): LocationFieldValue {
  const key = search.locationKey;
  if (!key || key === projectDefault.canonicalKey) return projectDefault;
  const [countryCode = "", , cityName = null] = key.split("/");
  if (!key.includes("/")) return countryValueForCode(countryCode) ?? projectDefault;
  return {
    canonicalKey: key,
    cityName,
    countryCode,
    displayName: search.market,
    kind: "city",
  };
}

export function recentSearchReplay(
  search: RecentKeywordResearch,
  selectedConnectionId: string,
  eligibleConnectionIds: readonly string[],
  now = new Date(),
) {
  const eligible = new Set(eligibleConnectionIds);
  const connectionId = eligible.has(search.connectionId ?? "")
    ? search.connectionId
    : eligible.has(selectedConnectionId)
      ? selectedConnectionId
      : eligibleConnectionIds[0];
  return {
    cached: cacheTimeRemaining(search.cachedUntil, now) > 0,
    connectionId,
    overrides: {
      connectionId,
      fresh: false,
      includeClickstream: search.includeClickstream,
      locationKey: search.locationKey,
      mode: search.mode,
      resultLimit: search.resultLimit,
    } satisfies Partial<ResearchKeywordsActionInput>,
  };
}

export type ResearchAddDraft = TrackingConfigurationValue & {
  keywords: string[];
};

export type ResearchSaveDraft = {
  location: string;
  rows: GroupedResearchRow[];
  sourceSeed: string;
};

export function researchSaveInput(projectId: string, draft: ResearchSaveDraft): SaveKeywordsInput {
  return {
    projectId,
    rows: draft.rows.map((row) => ({
      cpcCents: row.cpcCents,
      difficulty: row.difficulty,
      intent: row.intent,
      keyword: row.keyword,
      location: draft.location,
      monthlyTrend: row.monthlyTrend,
      searchVolume: row.searchVolume,
      sourceSeed: draft.sourceSeed,
      variantCount: Math.max(0, row.variants.length - 1),
    })),
  };
}

export function researchFailureState(
  outcome: Exclude<UiResearchOutcome, KeywordResearchSuccess>,
): ResearchState {
  if (outcome.reason === "budget_exhausted") return "budget_exhausted";
  if (outcome.reason === "needs_reauth") return "needs_reauth";
  if (outcome.reason === "no_source") return "no_provider";
  if (outcome.reason === "unsupported_location") return "unsupported_location";
  return "lookup_failed";
}

function zonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    minute: "numeric",
    month: "numeric",
    second: "numeric",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(value);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    day: numberPart("day"),
    hour: numberPart("hour"),
    minute: numberPart("minute"),
    month: numberPart("month"),
    second: numberPart("second"),
    year: numberPart("year"),
  };
}

function zonedMonthStart(year: number, month: number, timezone: string) {
  const target = Date.UTC(year, month - 1, 1);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = zonedParts(new Date(instant), timezone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    instant += target - observedAsUtc;
  }
  return new Date(instant);
}

export function nextBudgetResetLabel(timezone: string, now = new Date()) {
  const localNow = zonedParts(now, timezone);
  const reset =
    localNow.month === 12
      ? zonedMonthStart(localNow.year + 1, 1, timezone)
      : zonedMonthStart(localNow.year, localNow.month + 1, timezone);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(reset);
}
