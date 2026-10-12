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
      /** The exact median in cents; amountCents is this text as a number. */
      amountText: string;
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

export type ProviderRateContext = Pick<
  ResolveProviderRateInput,
  "entries" | "manualAmountCents"
> & {
  nativeRankCosts?: {
    provider: string;
    centsByDepth: Readonly<Record<number, number | null>>;
  };
};

export const LIST_PROVIDER_RATE_CONTEXT = {
  entries: [],
  manualAmountCents: null,
} as const satisfies Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;

const MINIMUM_MEASURED_SAMPLE_SIZE = 5;
/** Measured rates use the latest samples per connection and feature within the trailing days. */
export const MAX_PROVIDER_RATE_SAMPLES = 50;
export const PROVIDER_RATE_TRAILING_DAYS = 30;

function amount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

/** Decimal text of a positive sample, or null. Database decimals arrive as plain text. */
function positiveDecimal(value: unknown): string | null {
  const numeric = amount(value);
  if (numeric === null || numeric <= 0) return null;
  const text = String(value).trim();
  return /^\d+(\.\d+)?$/.test(text) ? text : numeric.toFixed(12);
}

/** Exact median of decimal texts: an even count averages its middle pair without rounding. */
export function exactMedianText(values: readonly string[]): string {
  if (values.length === 0) throw new Error("A median needs at least one value.");
  const scale = Math.max(...values.map((text) => text.split(".")[1]?.length ?? 0));
  const scaled = values
    .map((text) => {
      const [whole = "0", fraction = ""] = text.split(".");
      return BigInt(whole + fraction.padEnd(scale, "0"));
    })
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(scaled.length / 2);
  const odd = scaled.length % 2 === 1;
  const value = odd
    ? (scaled[middle] ?? 0n)
    : ((scaled[middle - 1] ?? 0n) + (scaled[middle] ?? 0n)) * 5n;
  const digits = odd ? scale : scale + 1;
  const padded = value.toString().padStart(digits + 1, "0");
  const fraction = padded.slice(padded.length - digits).replace(/0+$/, "");
  const whole = padded.slice(0, padded.length - digits);
  return fraction ? `${whole}.${fraction}` : whole;
}

export function resolveProviderRate(input: ResolveProviderRateInput): ResolvedProviderRate {
  const manualAmountCents = amount(input.manualAmountCents);
  if (manualAmountCents !== null) {
    return { amountCents: manualAmountCents, source: "manual" };
  }

  const measuredEntries = input.entries.flatMap((entry) => {
    if (entry.cached || entry.failed) return [];
    const costCents = positiveDecimal(entry.costCents);
    return costCents === null ? [] : [{ costCents, createdAt: entry.createdAt }];
  });
  if (measuredEntries.length >= MINIMUM_MEASURED_SAMPLE_SIZE) {
    const checkedAt = measuredEntries.reduce(
      (latest, entry) => (entry.createdAt > latest ? entry.createdAt : latest),
      measuredEntries[0]?.createdAt ?? new Date(0),
    );
    const amountText = exactMedianText(measuredEntries.map((entry) => entry.costCents));
    return {
      amountCents: Number(amountText),
      amountText,
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
