import { modelCostEvidenceSchema } from "@/lib/providers/model/transport-contract";
import { expect, it } from "vitest";
import { result, unknownMoney } from "./contract-fixtures.test-support";
import { type ModelCostEvidence, modelColumnResultSchema } from "./types";

const money = (amount = "0.10", currency = "USD") => ({
  ...unknownMoney,
  amount,
  currency,
  certainty: "reported" as const,
  basis: "provider_response" as const,
});
const costs = (): ModelCostEvidence => ({
  providerReported: {
    money: money(),
    scope: {
      kind: "unknown",
      includes: [],
      excludes: [],
      unknown: [
        "inference",
        "tools",
        "routing",
        "reporting_writes",
        "zero_data_retention",
        "other",
      ],
    },
  },
  upstreamInference: { total: money(), input: money("0.05"), output: money("0.05") },
  localEstimate: {
    ...money(),
    certainty: "estimated",
    basis: "rate_card",
    rateCardVersion: "rates-v1",
  },
});

it.each(["providerReported", "total", "input", "output", "localEstimate"])(
  "C2 rejects mixed cost-evidence currency in %s",
  (slot) => {
    const evidence = costs();
    if (slot === "providerReported" && evidence.providerReported)
      evidence.providerReported.money.currency = "EUR";
    else if (slot === "localEstimate" && evidence.localEstimate)
      evidence.localEstimate.currency = "EUR";
    else if (evidence.upstreamInference)
      evidence.upstreamInference[slot as "total" | "input" | "output"] = money("0.05", "EUR");
    expect(modelCostEvidenceSchema.safeParse(evidence).success).toBe(false);
  },
);
it.each(["reported", "estimated"] as const)(
  "C2 matches the %s provider cost currency",
  (certainty) => {
    const providerCost =
      certainty === "reported"
        ? money("0.10", "EUR")
        : {
            ...money("0.10", "EUR"),
            certainty,
            basis: "rate_card",
            rateCardVersion: "rates-v1",
          };
    expect(
      modelColumnResultSchema.safeParse({ ...result(), providerCost, costEvidence: costs() })
        .success,
    ).toBe(false);
  },
);
it("C2 preserves unknown provider costs and nullable evidence", () => {
  expect(modelColumnResultSchema.safeParse({ ...result(), costEvidence: costs() }).success).toBe(
    true,
  );
  expect(
    modelColumnResultSchema.safeParse({
      ...result(),
      costEvidence: {
        providerReported: null,
        localEstimate: null,
        upstreamInference: { total: money("0.10", "EUR"), input: null, output: null },
      },
    }).success,
  ).toBe(true);
  expect(
    modelColumnResultSchema.safeParse({
      ...result(),
      providerCost: money(),
      costEvidence: { providerReported: null, upstreamInference: null, localEstimate: null },
    }).success,
  ).toBe(true);
});
it("C5 rejects a known complete consulted list labelled truncated", () => {
  expect(
    modelColumnResultSchema.safeParse({
      ...result(),
      consultedSources: {
        sources: [{ sourceId: "consulted", url: "https://example.org/source", title: null }],
        total: 1,
        omitted: 0,
        truncated: true,
      },
    }).success,
  ).toBe(false);
});
it.each([true, false])("C5 preserves unknown totals with truncated=%s", (truncated) => {
  const consultedSources = { sources: [], total: null, omitted: null, truncated };
  expect(modelColumnResultSchema.parse({ ...result(), consultedSources }).consultedSources).toEqual(
    consultedSources,
  );
});
it.each([
  ["input", "0.10", "0.30"],
  ["output", "0.10", "0.30"],
  ["input", "0.1000000000000000000000", "0.1000000000000000000001"],
  ["output", "9.9999999999999999999999", "10"],
])("C6 rejects %s=%s/%s above the total exactly", (slot, total, amount) => {
  const evidence = {
    providerReported: null,
    localEstimate: null,
    upstreamInference: {
      total: money(total),
      input: money("0"),
      output: money("0"),
      [slot]: money(amount),
    },
  };
  expect(modelCostEvidenceSchema.safeParse(evidence).success).toBe(false);
});
it.each([
  ["0.10", "0.100", "0"],
  ["10", "9.9999999999999999999999", "1"],
  ["0.1000000000000000000001", "0.1000000000000000000000", "0.1"],
  ["0.000", "0.0", "0"],
])("C6 allows components bounded by %s regardless of scale", (total, input, output) => {
  expect(
    modelCostEvidenceSchema.safeParse({
      providerReported: null,
      localEstimate: null,
      upstreamInference: { total: money(total), input: money(input), output: money(output) },
    }).success,
  ).toBe(true);
});
