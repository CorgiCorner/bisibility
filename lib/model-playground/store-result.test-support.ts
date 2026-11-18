import { result, unknownMoney } from "./contract-fixtures.test-support";
import type { ModelColumnResult } from "./types";

function present<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing result extension fixture");
  return value;
}

export function extendedResult(base = result()): ModelColumnResult {
  const money = {
    ...unknownMoney,
    amount: "0.123456789012345678901",
    certainty: "reported" as const,
    basis: "provider_response" as const,
  };
  return {
    ...base,
    consultedSources: {
      sources: [{ sourceId: "consulted-1", url: "https://example.org/consulted", title: null }],
      total: 1,
      omitted: 0,
      truncated: false,
    },
    citationTotals: { total: base.citations.length, omitted: 0 },
    costEvidence: {
      providerReported: {
        money,
        scope: {
          kind: "subtotal",
          includes: ["inference", "tools"],
          excludes: ["reporting_writes", "zero_data_retention"],
          unknown: ["routing", "other"],
        },
      },
      upstreamInference: { total: money, input: null, output: null },
      localEstimate: {
        ...money,
        certainty: "estimated",
        basis: "rate_card",
        rateCardVersion: "rates-v1",
      },
    },
  };
}

const valid = extendedResult();
const sources = present(valid.consultedSources);
const cost = present(valid.costEvidence);
const reported = present(cost.providerReported);
export const invalidResultExtensions = [
  { unexpected: true },
  { consultedSources: null },
  { consultedSources: { ...sources, sources: {} } },
  { consultedSources: { ...sources, sources: Array(101).fill(sources.sources[0]) } },
  ...[null, [], "source", {}, { ...sources.sources[0], title: 1 }].map((source) => ({
    consultedSources: { ...sources, sources: [source] },
  })),
  { consultedSources: { ...sources, truncated: "false" } },
  { consultedSources: { sources: [], total: null, omitted: null } },
  { consultedSources: { ...sources, extra: true } },
  ...["consultedSources", "citationTotals"].flatMap((key) =>
    ["total", "omitted"].flatMap((counter) =>
      [-1, 0.5, "1", 9007199254740992].map((value) => ({
        [key]: {
          ...(key === "consultedSources" ? sources : valid.citationTotals),
          [counter]: value,
        },
      })),
    ),
  ),
  { citationTotals: {} },
  { citationTotals: [] },
  { citationTotals: { total: null, omitted: null, extra: true } },
  { costEvidence: null },
  { costEvidence: [] },
  { costEvidence: {} },
  { costEvidence: { ...cost, extra: true } },
  ...["providerReported", "upstreamInference", "localEstimate"].flatMap((slot) =>
    [1, [], "money", {}].map((value) => ({ costEvidence: { ...cost, [slot]: value } })),
  ),
  {
    costEvidence: {
      ...cost,
      providerReported: { ...reported, money: { ...reported.money, amount: 0.1 } },
    },
  },
  {
    costEvidence: {
      ...cost,
      upstreamInference: { total: { ...reported.money, amount: 1 }, input: null, output: null },
    },
  },
  ...["unknown", "rate_card"].map((invalid) => ({
    costEvidence: {
      ...cost,
      providerReported: {
        ...reported,
        money: {
          ...reported.money,
          ...(invalid === "unknown" ? { certainty: invalid } : { basis: invalid }),
        },
      },
    },
  })),
  { costEvidence: { ...cost, localEstimate: { ...cost.localEstimate, amount: 1 } } },
  {
    costEvidence: {
      ...cost,
      providerReported: { ...reported, scope: { ...reported.scope, includes: "inference" } },
    },
  },
  {
    costEvidence: {
      ...cost,
      providerReported: { ...reported, scope: { ...reported.scope, kind: "invented" } },
    },
  },
  {
    costEvidence: {
      ...cost,
      providerReported: {
        ...reported,
        scope: { ...reported.scope, includes: Array(7).fill("inference") },
      },
    },
  },
];
