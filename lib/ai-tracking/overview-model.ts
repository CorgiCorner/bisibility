import { type AiVisibilityQuery, firstQueryValue } from "@/lib/ai-tracking/ai-visibility-paths";
import { TRACKING_ENGINES, type TrackingEngine } from "@/lib/ai-tracking/contract";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { normalizeDomain } from "@/lib/domains/normalize";

/**
 * Answer limit for one Overview request. The loader keeps the newest rows and
 * reports when older answers in the same filters were left out.
 */
export const AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT = 2000;
export const AI_VISIBILITY_CANDIDATE_LIMIT = 10;
export const AI_VISIBILITY_INSIGHT_DOMAIN_LIMIT = 3;

export const overviewPeriods = ["7d", "30d", "90d", "all"] as const;
export type OverviewPeriod = (typeof overviewPeriods)[number];
export const DEFAULT_OVERVIEW_PERIOD: OverviewPeriod = "30d";

export const overviewPromptKinds = ["all", "branded", "unbranded"] as const;
export type OverviewPromptKind = (typeof overviewPromptKinds)[number];

const PERIOD_DAYS = { "7d": 7, "30d": 30, "90d": 90, all: null } as const;

export type OverviewFilters = {
  engine: TrackingEngine | null;
  market: ParsedMarket | null;
  period: OverviewPeriod;
  promptKind: OverviewPromptKind;
  topic: string | null;
};

export type ParsedMarket =
  | { kind: "code"; code: number; language: string }
  | { kind: "name"; language: string; location: string };

export type OverviewAnswerInput = {
  answerText: string;
  citations: readonly { url: string }[];
  costMicros: number | null;
  engine: string;
  finishedAt: string | null;
  id: string;
  promptText: string;
  provider: string | null;
};

export type OverviewEntityInput = {
  aliases: readonly string[];
  domain: string | null;
  excludedNames: readonly string[];
  id: string;
  kind: "competitor" | "project";
  label: string;
};

export type OverviewProjectionInput = {
  answers: readonly OverviewAnswerInput[];
  entities: readonly OverviewEntityInput[];
  promptKind: OverviewPromptKind;
  timeZone: string;
  truncated: boolean;
};

export type OverviewNameCount = { count: number; name: string };

export type OverviewBrandRow = {
  aliases: readonly string[];
  answersNamed: number | null;
  domain: string | null;
  excludedNames: readonly string[];
  id: string;
  kind: "candidate" | "competitor" | "project";
  label: string;
  links: number;
  mentions: number | null;
  nameCounts: readonly OverviewNameCount[];
  share: { mentions: number; total: number } | null;
};

export type OverviewEngineRow = {
  answers: number;
  cited: number;
  engine: string;
  named: number;
  providers: readonly string[];
  /** Enabled for the project, with no answers in this tally. */
  quiet?: boolean;
};

export type OverviewSpellingRow = {
  entityId: string;
  kind: "competitor" | "project";
  label: string;
  mentions: number;
  names: readonly OverviewNameCount[];
  removable: readonly string[];
};

export type OverviewInsight = {
  answers: number;
  domain: string | null;
  domains: readonly string[];
  engines: readonly string[];
  ownLinks: number;
  totalLinks: number;
};

export type OverviewDay = {
  answers: number;
  citedShare: number;
  day: string;
  mentionedShare: number;
};

export type AiVisibilityOverview = {
  brands: readonly OverviewBrandRow[];
  cited: {
    cited: number;
    links: number;
    total: number;
    unbrandedCited: number;
    unbrandedTotal: number;
  };
  coverage: {
    costMicros: number | null;
    dates: readonly string[];
    engines: readonly string[];
  };
  days: readonly OverviewDay[];
  engines: readonly OverviewEngineRow[];
  insight: OverviewInsight | null;
  limit: number;
  mentioned: {
    named: number;
    total: number;
    unbrandedNamed: number;
    unbrandedTotal: number;
  };
  project: { domain: string | null; label: string };
  shareOfVoice: {
    leader: { label: string; mentions: number; own: boolean };
    mentions: number;
    total: number;
  } | null;
  spellings: readonly OverviewSpellingRow[];
  totalAnswers: number;
  truncated: boolean;
};

export type OverviewMarketOption = { key: string; label: string };

export type AiVisibilityOverviewLoad = {
  canAddCompetitor: boolean;
  engines: readonly string[];
  filters: OverviewFilters;
  hasAnswers: boolean;
  markets: readonly OverviewMarketOption[];
  overview: AiVisibilityOverview;
  topics: readonly { id: string; name: string }[];
  windowFrom: string | null;
};

export function overviewPeriod(value: string | null | undefined): OverviewPeriod {
  const match = overviewPeriods.find((period) => period === value);
  return match ?? DEFAULT_OVERVIEW_PERIOD;
}

export function overviewPeriodStart(period: OverviewPeriod, now: Date): Date | null {
  const days = PERIOD_DAYS[period];
  if (days === null) return null;
  return new Date(now.getTime() - days * 86_400_000);
}

export function overviewEngine(value: string | null | undefined): TrackingEngine | null {
  return TRACKING_ENGINES.find((engine) => engine === value) ?? null;
}

export function overviewTopic(value: string | null | undefined): string | null {
  return value && isPublicIdOfType(value, "ait") ? value : null;
}

export function overviewPromptKind(value: string | null | undefined): OverviewPromptKind {
  const match = overviewPromptKinds.find((kind) => kind === value);
  return match ?? "all";
}

export function marketKey(market: ParsedMarket): string {
  if (market.kind === "name") {
    return `n:${encodeURIComponent(market.location)}:${encodeURIComponent(market.language)}`;
  }
  return `c:${market.code}:${encodeURIComponent(market.language)}`;
}

export function parseMarketKey(value: string | null | undefined): ParsedMarket | null {
  if (!value) return null;
  const named = /^n:([^:]*):([^:]*)$/.exec(value);
  if (named) {
    const location = decodeURIComponent(named[1]).trim();
    if (!location) return null;
    return { kind: "name", language: decodeURIComponent(named[2]), location };
  }
  const coded = /^c:(\d+):([^:]*)$/.exec(value);
  if (!coded) return null;
  return { code: Number(coded[1]), kind: "code", language: decodeURIComponent(coded[2]) };
}

export function overviewFiltersFromQuery(query: AiVisibilityQuery): OverviewFilters {
  return {
    engine: overviewEngine(firstQueryValue(query.engine)),
    market: parseMarketKey(firstQueryValue(query.market)),
    period: overviewPeriod(firstQueryValue(query.range)),
    promptKind: overviewPromptKind(firstQueryValue(query.prompts)),
    topic: overviewTopic(firstQueryValue(query.topic)),
  };
}

export function overviewSearchParams(
  filters: OverviewFilters,
  tab: "overview" | "sources" = "overview",
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (filters.period !== DEFAULT_OVERVIEW_PERIOD) params.set("range", filters.period);
  if (filters.engine) params.set("engine", filters.engine);
  if (filters.topic) params.set("topic", filters.topic);
  if (filters.market) params.set("market", marketKey(filters.market));
  if (filters.promptKind !== "all") params.set("prompts", filters.promptKind);
  return params;
}

export function parseUsdMicros(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const padded = `${fraction}0000000`;
  const micros = Number(padded.slice(0, 6));
  const round = padded[6] >= "5" ? 1 : 0;
  const result = Number(whole) * 1_000_000 + micros + round;
  return Number.isSafeInteger(result) ? result : null;
}

export function citationHost(url: string): string | null {
  return normalizeDomain(url);
}

/** Own site and competitor domains match with or without a leading www, and not as a subdomain. */
export function hostOnSite(host: string, domain: string | null): boolean {
  if (!domain) return false;
  const site = normalizeDomain(domain);
  return Boolean(site && host === site);
}

export function overviewDayKey(iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function marketFromParameters(
  parameters: unknown,
  languageLabel: (code: string) => string,
): OverviewMarketOption | null {
  const record = recordOf(parameters);
  if (!record) return null;
  const language = typeof record.language_code === "string" ? record.language_code : "";
  const languageName = language ? languageLabel(language) : "";
  const name = typeof record.location_name === "string" ? record.location_name.trim() : "";
  if (name) {
    const market = { kind: "name" as const, language, location: name };
    return { key: marketKey(market), label: languageName ? `${name} · ${languageName}` : name };
  }
  if (typeof record.location_code === "number" && Number.isInteger(record.location_code)) {
    const place = String(record.location_code);
    const market = { code: record.location_code, kind: "code" as const, language };
    return { key: marketKey(market), label: languageName ? `${place} · ${languageName}` : place };
  }
  return null;
}
