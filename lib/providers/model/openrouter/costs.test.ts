import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { modelCostEvidenceSchema } from "@/lib/providers/model/transport-contract";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { describe, expect, it, vi } from "vitest";
import { normalizeOpenRouterResponse } from "./normalize";
import { canary, forbidNetwork, normal, request } from "./test-support";

forbidNetwork();
const reported = (amount: string) => ({
  amount,
  currency: "USD",
  certainty: "reported",
  basis: "provider_response",
  rateCardVersion: null,
});
const subtotal = {
  kind: "subtotal",
  includes: [],
  excludes: [],
  unknown: ["inference", "tools", "routing", "reporting_writes", "zero_data_retention", "other"],
};
function result(
  cost: string,
  details: Record<string, unknown>,
  options: { search: boolean; isByok: unknown } = { search: false, isByok: false },
) {
  const body = normal();
  return modelColumnResultSchema.parse({
    ...transportEvidence(request().column, Date.now(), null),
    ...normalizeOpenRouterResponse(
      {
        ...body,
        usage: { ...body.usage, is_byok: options.isByok, cost, cost_details: details },
      },
      options.search,
      canary,
    ),
  });
}

describe("reported totals against upstream evidence", () => {
  // Synthetic post-lossless-parser amounts, including values indistinguishable as floats.
  it.each([
    ["0", "0.000", "total"],
    ["0.10", "0.10000", "total"],
    ["0.10000", "0.10", "total"],
    ["1.000", "1.00001", "subtotal"],
    ["1.00001", "1.000", "total"],
    ["10.000", "9.99999", "total"],
    ["0.95", "0.95000000000000000001", "subtotal"],
    ["0.95", "0.9500", "total"],
    ["0.95", "0.94999999999999999999", "total"],
    ["2", "10", "subtotal"],
    ["10", "2", "total"],
    ["11", "12", "subtotal"],
    ["12", "11", "total"],
    ["0", `0.${"0".repeat(2045)}1`, "subtotal"],
    ["9".repeat(2047), `1${"0".repeat(2047)}`, "subtotal"],
  ])("compares charge %s with upstream %s as %s", (cost, amount, kind) => {
    expect(paymentDecimalSchema.safeParse(cost).success).toBe(true);
    expect(paymentDecimalSchema.safeParse(amount).success).toBe(true);
    for (const field of ["total", "input", "output"] as const) {
      const wireField = { total: "cost", input: "prompt_cost", output: "completions_cost" }[field];
      const value = result(cost, {
        upstream_inference_cost: null,
        [`upstream_inference_${wireField}`]: amount,
      });
      expect(value).toMatchObject({
        state: "completed",
        failure: null,
        answer: "Synthetic answer.",
        usage: { inputTokens: 194, outputTokens: 20, completeness: "complete" },
      });
      expect(value.costEvidence?.providerReported?.money).toEqual(reported(cost));
      expect(value.costEvidence?.providerReported?.scope.kind).toBe(kind);
      if (kind === "subtotal") {
        expect(value.costEvidence?.providerReported?.scope).toEqual(subtotal);
        expect(value.providerCost).toMatchObject({
          amount: null,
          certainty: "unknown",
          basis: "unknown",
        });
      } else expect(value.providerCost).toEqual(reported(cost));
      expect(value.costEvidence?.upstreamInference).toEqual({
        total: null,
        input: null,
        output: null,
        [field]: reported(amount),
      });
    }
  });

  for (const search of [false, true]) {
    it.each([false, undefined, null, "false", true])(
      `classifies contradicted inference with search=${search}, is_byok=%s`,
      (isByok) => {
        const value = result("0.1", { upstream_inference_prompt_cost: "0.2" }, { search, isByok });
        expect(value.costEvidence?.providerReported?.scope).toEqual(
          isByok === true
            ? { ...subtotal, excludes: ["inference"], unknown: subtotal.unknown.slice(1) }
            : subtotal,
        );
        expect(value.providerCost).toMatchObject({ amount: null, certainty: "unknown" });
        expect(value.costEvidence?.upstreamInference?.input).toEqual(reported("0.2"));
        expect(value.answer).toBe("Synthetic answer.");
      },
    );
  }

  it.each([
    ["0.1", "0.06", "0.06", null, "subtotal"],
    ["0.1", "0.05", "0.05", null, "total"],
    ["0.1", "0.06", "0.06", "0.1", "subtotal"],
    ["0.1", "0.06", null, null, "total"],
    ["0.1", null, "0.06", null, "total"],
    ["0.1", "0.11", null, null, "subtotal"],
    ["0.1", null, "0.11", null, "subtotal"],
    ["0.10", "0.05000", "0.05", null, "total"],
    ["0.1", "0.05", "0.05000000000000000001", null, "subtotal"],
    ["1", "0.99999999999999999999", "0.00000000000000000001", null, "total"],
    ["10", "9.99", "0.02", null, "subtotal"],
    ["0", "0.000", "0", null, "total"],
    ["0", "0", `0.${"0".repeat(2045)}1`, null, "subtotal"],
    ["9".repeat(2048), "9".repeat(2048), "1", null, "subtotal"],
  ])(
    "compares exact component sum for %s, %s + %s, total %s as %s",
    (cost, input, output, total, kind) => {
      const value = result(cost, {
        upstream_inference_cost: total,
        upstream_inference_prompt_cost: input,
        upstream_inference_completions_cost: output,
      });
      expect(value.costEvidence?.providerReported?.scope.kind).toBe(kind);
      if (kind === "subtotal")
        expect(value.costEvidence?.providerReported?.scope).toEqual(subtotal);
      expect(value.providerCost.amount).toBe(kind === "total" ? cost : null);
      expect(value.costEvidence?.upstreamInference).toEqual({
        total: total === null ? null : reported(total),
        input: input === null ? null : reported(input),
        output: output === null ? null : reported(output),
      });
      expect(value.costEvidence?.localEstimate).toBeNull();
      expect(value.answer).toBe("Synthetic answer.");
    },
  );

  // lib/action-payment/schema.ts: ^(?:0|[1-9]\d*)(?:\.\d+)?$, maximum 2048 characters.
  it.each([
    "",
    "00.5",
    "01",
    ".5",
    "1.",
    "-0",
    "+0",
    "1e-2",
    " 1",
    "1 ",
    "1\n",
    "1,2",
    "1".repeat(2049),
  ])("rejects amounts outside the shared decimal grammar: %j", (amount) => {
    expect(paymentDecimalSchema.safeParse(amount).success).toBe(false);
    const value = result(amount, { upstream_inference_prompt_cost: amount });
    expect(value.costEvidence?.providerReported).toBeNull();
    expect(value.costEvidence?.upstreamInference).toBeNull();
    expect(value.providerCost.amount).toBeNull();
  });

  it("keeps both evidence parts from the inconsistent documentation example", () => {
    // Documentation-derived Responses values mapped to Chat Completions field names.
    const value = result("0.95", {
      upstream_inference_cost: null,
      upstream_inference_prompt_cost: "18",
      upstream_inference_completions_cost: "1",
    });
    expect(value.providerCost.amount).toBeNull();
    expect(value.costEvidence).toEqual({
      providerReported: { money: reported("0.95"), scope: subtotal },
      upstreamInference: { total: null, input: reported("18"), output: reported("1") },
      localEstimate: null,
    });
    expect(value.state).toBe("completed");
    expect(value.answer).toBe("Synthetic answer.");
  });

  it.each(["0", "0.1"])(
    "nulls all violating components beside total %s without restoring a contradicted charge",
    (total) => {
      const value = result("0.15", {
        upstream_inference_cost: total,
        upstream_inference_prompt_cost: "0.2",
        upstream_inference_completions_cost: "0.3",
      });
      expect(value.costEvidence).toEqual({
        providerReported: { money: reported("0.15"), scope: subtotal },
        upstreamInference: { total: reported(total), input: null, output: null },
        upstreamInferenceDiscardReason: "inconsistent",
        localEstimate: null,
      });
      expect(value.providerCost.amount).toBeNull();
      expect(value.state).toBe("completed");
      expect(value.answer).toBe("Synthetic answer.");
    },
  );

  it("keeps the breakdown null when no admissible amount remains", () => {
    const value = result("0.95", {
      upstream_inference_cost: "invalid",
      upstream_inference_prompt_cost: -1,
      upstream_inference_completions_cost: null,
    });
    expect(value.costEvidence?.upstreamInference).toBeNull();
    expect(value.providerCost).toEqual(reported("0.95"));
  });

  it.each(["input", "output"] as const)("reports a discard when only %s exceeds total", (slot) => {
    const value = result("0.15", {
      upstream_inference_cost: "0.1",
      upstream_inference_prompt_cost: slot === "input" ? "0.2" : "0.03",
      upstream_inference_completions_cost: slot === "output" ? "0.2" : "0.03",
    });
    expect(value.costEvidence).toEqual({
      providerReported: { money: reported("0.15"), scope: subtotal },
      upstreamInference: {
        total: reported("0.1"),
        input: slot === "input" ? null : reported("0.03"),
        output: slot === "output" ? null : reported("0.03"),
      },
      upstreamInferenceDiscardReason: "inconsistent",
      localEstimate: null,
    });
  });

  it("reports a discard when the defensive fallback drops the whole breakdown", () => {
    const parse = modelCostEvidenceSchema.safeParse.bind(modelCostEvidenceSchema);
    const rejected = parse({});
    // Current valid wire values only need component repair; inject rejection of that repair.
    const spy = vi
      .spyOn(modelCostEvidenceSchema, "safeParse")
      .mockImplementationOnce(parse)
      .mockReturnValueOnce(rejected);
    try {
      const value = result("0.15", {
        upstream_inference_cost: "0.1",
        upstream_inference_prompt_cost: "0.2",
      });
      expect(spy).toHaveBeenCalledTimes(3);
      expect(value.costEvidence).toEqual({
        providerReported: { money: reported("0.15"), scope: subtotal },
        upstreamInference: null,
        upstreamInferenceDiscardReason: "inconsistent",
        localEstimate: null,
      });
    } finally {
      spy.mockRestore();
    }
  });
});
