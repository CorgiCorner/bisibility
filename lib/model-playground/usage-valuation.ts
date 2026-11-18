import type { ModelUsage } from "./types";
import type { ModelUsageBinding, ModelUsageDimension } from "./usage-contract";

/** Exact unsigned decimal arithmetic; no binary floating point or rounding of cents. */
export function shiftUsageDecimal(value: string, places: number): string {
  const [whole, fraction = ""] = value.split(".");
  const digits = whole + fraction;
  const point = whole.length + places;
  const text =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [integer, tail = ""] = text.split(".");
  const trimmed = tail.replace(/0+$/, "");
  return `${BigInt(integer)}${trimmed ? `.${trimmed}` : ""}`;
}

export function valueModelUsage(
  binding: ModelUsageBinding,
  usage: ModelUsage | null,
  complete: boolean,
) {
  const unknown = { certainty: "unknown" as const, cents: null, rateCardVersion: null };
  const card = binding.rateCard;
  if (
    !complete ||
    !usage ||
    usage.inputTokens === null ||
    usage.outputTokens === null ||
    !card ||
    card.scope.kind !== "total"
  )
    return unknown;
  const counts = new Map<ModelUsageDimension, number | null>(
    binding.policy.billableDimensions.map((dimension) => [dimension, usage[dimension]]),
  );
  if (binding.policy.inputCacheAccounting === "included")
    counts.set(
      "inputTokens",
      usage.inputTokens -
        (counts.has("cacheReadInputTokens") ? (usage.cacheReadInputTokens ?? 0) : 0) -
        (counts.has("cacheWriteInputTokens") ? (usage.cacheWriteInputTokens ?? 0) : 0),
    );
  if (counts.has("reasoningTokens"))
    counts.set(
      "outputTokens",
      usage.reasoningTokens === null ? null : usage.outputTokens - usage.reasoningTokens,
    );
  if (counts.has("searchContentTokens")) {
    if (binding.policy.searchContentAccounting === "unknown") return unknown;
    if (binding.policy.searchContentAccounting === "included")
      counts.set(
        "inputTokens",
        usage.searchContentTokens === null
          ? null
          : (counts.get("inputTokens") ?? 0) - usage.searchContentTokens,
      );
  }
  const terms: { amount: bigint; scale: number }[] = [];
  for (const [dimension, quantity] of counts) {
    if (quantity === null || quantity < 0) return unknown;
    const ttls = dimension === "cacheWriteInputTokens" ? binding.policy.cacheWriteTtls : [];
    const parts = ttls.length
      ? ttls.map((ttl) => ({
          ttl,
          quantity: usage.cacheWrites.find((write) => write.ttlSeconds === ttl)?.tokens ?? null,
        }))
      : [{ ttl: undefined, quantity }];
    for (const part of parts) {
      if (part.quantity === null) return unknown;
      const rate = card.rates.find(
        (rate) => rate.dimension === dimension && rate.ttlSeconds === part.ttl,
      );
      if (!rate) return unknown;
      const [whole, fraction = ""] = rate.usdPerUnit.split(".");
      terms.push({
        amount: BigInt(whole + fraction) * BigInt(part.quantity) * 100n,
        scale: fraction.length,
      });
    }
  }
  const scale = Math.max(0, ...terms.map((term) => term.scale));
  const total = terms.reduce(
    (sum, term) => sum + term.amount * 10n ** BigInt(scale - term.scale),
    0n,
  );
  const cents = shiftUsageDecimal(total.toString(), -scale);
  // Advisory values must fit both the retained decimal and Meter quantity contracts.
  if (cents.length > 80 || (cents.split(".")[1]?.length ?? 0) > 18) return unknown;
  return {
    certainty: "estimated" as const,
    cents,
    rateCardVersion: card.version,
  };
}
