import type { TrackingEngine, TrackingSource } from "@/lib/ai-tracking/contract";
import type { ProjectEngineChoice } from "@/lib/ai-tracking/project-engine-set";
import type { TrackingEnginePriceCard } from "@/lib/ai-tracking/tracking-engines";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";

/** The only catalog provider AI Visibility calls today. */
export const AI_VISIBILITY_PROVIDER_ID = "dataforseo";

export function aiVisibilityProviders(): readonly string[] {
  return PROVIDER_CATALOG.some((entry) => entry.id === AI_VISIBILITY_PROVIDER_ID)
    ? [AI_VISIBILITY_PROVIDER_ID]
    : [];
}

export type EnginePriceLabel =
  | { kind: "by_length" }
  | { kind: "dash" }
  | { kind: "free" }
  | { kind: "none" }
  | { kind: "usd"; usd: number };

type PricedEngine =
  | { availability: "rank_tracker" }
  | { availability: "toggle"; engine: TrackingEngine; source: TrackingSource }
  | { availability: "unavailable" };

/** A missing or stale card is a dash. Model APIs are priced by length, never by the scraper bound. */
export function enginePriceLabel(
  row: PricedEngine,
  prices: TrackingEnginePriceCard,
): EnginePriceLabel {
  if (row.availability === "unavailable") return { kind: "none" };
  if (row.availability === "rank_tracker") return { kind: "free" };
  if (row.source === "model_api") return { kind: "by_length" };
  const usd = prices.usdByEngine[row.engine];
  return typeof usd === "number" ? { kind: "usd", usd } : { kind: "dash" };
}

const UNAVAILABLE_ENGINES = [
  { id: "perplexity", nameKey: "perplexity" },
  { id: "google_ai_mode", nameKey: "google_ai_mode" },
  { id: "bing_copilot", nameKey: "bing_copilot" },
] as const;

export type EnginesTableRow =
  | { group: "consumer" | "model"; id: string; kind: "section" }
  | {
      availability: "rank_tracker";
      id: "google_ai_overview";
      kind: "row";
      nameKey: "google_overview";
      on: boolean;
      price: EnginePriceLabel;
      recentAnswers: number;
    }
  | {
      availability: "toggle";
      enabled: boolean;
      engine: TrackingEngine;
      id: string;
      kind: "row";
      nameKey: TrackingEngine;
      price: EnginePriceLabel;
      recentAnswers: number;
      source: TrackingSource;
    }
  | {
      availability: "unavailable";
      id: string;
      kind: "row";
      nameKey: (typeof UNAVAILABLE_ENGINES)[number]["nameKey"];
      price: EnginePriceLabel;
    };

export type EnginesPageModel = {
  canWrite: boolean;
  providers: readonly { connected: boolean; id: string }[];
  rows: readonly EnginesTableRow[];
};

function enabledPair(enabled: readonly ProjectEngineChoice[], pair: ProjectEngineChoice): boolean {
  return enabled.some((item) => item.engine === pair.engine && item.source === pair.source);
}

export function buildEnginesPageModel(input: {
  canWrite: boolean;
  connected: boolean;
  enabled: readonly ProjectEngineChoice[];
  hasRankChecks: boolean;
  prices: TrackingEnginePriceCard;
  recentByEngine: Readonly<Record<string, number>>;
  toggleable: readonly ProjectEngineChoice[];
}): EnginesPageModel {
  const consumer = input.toggleable.filter((pair) => pair.source === "consumer_scrape");
  const model = input.toggleable.filter((pair) => pair.source === "model_api");
  const placed = consumer.length + model.length;
  if (placed !== input.toggleable.length) {
    throw new Error("An engine source has no Engines tab group.");
  }
  const recent = (engine: string) => input.recentByEngine[engine] ?? 0;
  const toggle = (pair: ProjectEngineChoice): EnginesTableRow => ({
    availability: "toggle",
    enabled: enabledPair(input.enabled, pair),
    engine: pair.engine,
    id: `${pair.source}:${pair.engine}`,
    kind: "row",
    nameKey: pair.engine,
    price: enginePriceLabel({ availability: "toggle", ...pair }, input.prices),
    recentAnswers: recent(`${pair.source}:${pair.engine}`),
    source: pair.source,
  });
  const rows: EnginesTableRow[] = [
    { group: "consumer", id: "section:consumer", kind: "section" },
    ...consumer.map(toggle),
    {
      availability: "rank_tracker",
      id: "google_ai_overview",
      kind: "row",
      nameKey: "google_overview",
      on: input.hasRankChecks,
      price: enginePriceLabel({ availability: "rank_tracker" }, input.prices),
      recentAnswers: recent("google_aio:google"),
    },
    ...UNAVAILABLE_ENGINES.map(
      (engine): EnginesTableRow => ({
        availability: "unavailable",
        id: engine.id,
        kind: "row",
        nameKey: engine.nameKey,
        price: enginePriceLabel({ availability: "unavailable" }, input.prices),
      }),
    ),
    { group: "model", id: "section:model", kind: "section" },
    ...model.map(toggle),
  ];
  return {
    canWrite: input.canWrite,
    providers: aiVisibilityProviders().map((id) => ({ connected: input.connected, id })),
    rows,
  };
}
