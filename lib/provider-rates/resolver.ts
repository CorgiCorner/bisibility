export const PROVIDER_RATE_FEATURES = [
  "rank_check",
  "keyword_research",
  "keyword_metrics",
  "ranked_keywords",
] as const;

export type ProviderRateFeature = (typeof PROVIDER_RATE_FEATURES)[number];
export type ProviderRateSource = "manual" | "measured" | "list" | "unknown";

export type ProviderRateEntry = {
  cached: boolean;
  costCents: unknown;
  createdAt: Date;
  failed: boolean;
  unitCostCents?: unknown;
};

export type ResolvedProviderRate =
  | { amountCents: number; source: "manual" }
  | {
      amountCents: number;
      checkedAt: Date;
      sampleSize: number;
      source: "measured";
    }
  | { amountCents: number; checkedAt: Date; source: "list" }
  | { source: "unknown" };

type ProviderRateListFallback = {
  amountCents: unknown;
  checkedAt: Date;
};

export type ResolveProviderRateInput = {
  entries: readonly ProviderRateEntry[];
  list: ProviderRateListFallback | null;
  manualAmountCents: unknown;
};

export const LIST_PROVIDER_RATE_CONTEXT = {
  entries: [],
  manualAmountCents: null,
} as const satisfies Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;

const MINIMUM_MEASURED_SAMPLE_SIZE = 5;

function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function positiveAmount(value: unknown): number | null {
  const numeric = amount(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function resolveProviderRate(input: ResolveProviderRateInput): ResolvedProviderRate {
  const manualAmountCents = amount(input.manualAmountCents);
  if (manualAmountCents !== null) {
    return { amountCents: manualAmountCents, source: "manual" };
  }

  const measuredEntries = input.entries.flatMap((entry) => {
    if (entry.cached || entry.failed) return [];
    const costCents = positiveAmount(entry.costCents);
    return costCents === null ? [] : [{ costCents, createdAt: entry.createdAt }];
  });
  if (measuredEntries.length >= MINIMUM_MEASURED_SAMPLE_SIZE) {
    const checkedAt = measuredEntries.reduce(
      (latest, entry) => (entry.createdAt > latest ? entry.createdAt : latest),
      measuredEntries[0]?.createdAt ?? new Date(0),
    );
    return {
      amountCents: median(measuredEntries.map((entry) => entry.costCents)),
      checkedAt,
      sampleSize: measuredEntries.length,
      source: "measured",
    };
  }

  const listAmountCents = amount(input.list?.amountCents);
  if (input.list && listAmountCents !== null) {
    return {
      amountCents: listAmountCents,
      checkedAt: input.list.checkedAt,
      source: "list",
    };
  }

  return { source: "unknown" };
}
