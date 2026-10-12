/** Select the canonical manual rate without loading unrelated provider settings. */
export const rankCheckRateSelection = {
  where: { feature: "rank_check" },
  select: { amountCents: true, feature: true },
} as const;

type ManualRateConnection = {
  credentialSource: string;
  rates: readonly { feature: string; amountCents: { toString(): string } | string | number }[];
};

/** Keep the established API field as a projection; the rate table is its only authority. */
export function withRankCheckManualRate<T extends ManualRateConnection>(connection: T) {
  return {
    ...connection,
    costPerCheckCents:
      connection.credentialSource === "own"
        ? (connection.rates.find((rate) => rate.feature === "rank_check")?.amountCents.toString() ??
          null)
        : null,
  };
}
