import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { describe, expect, it } from "vitest";
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
// Synthetic post-lossless-parser values; not string-valued wire captures.
function result(usage: unknown, search = false) {
  return modelColumnResultSchema.parse({
    ...transportEvidence(request().column, Date.now(), null),
    ...normalizeOpenRouterResponse({ ...normal(), usage }, search, canary),
  });
}

describe("scoped reported cost evidence", () => {
  it.each([false, true])("retains exact reported amounts with search=%s", (search) => {
    const value = result(
      {
        is_byok: false,
        cost: "0.0000000001234567890123456789",
        cost_details: {
          upstream_inference_cost: "0.0000000001",
          upstream_inference_prompt_cost: "0.00000000006",
          upstream_inference_completions_cost: "0.00000000004",
        },
      },
      search,
    );
    expect(value.costEvidence).toEqual({
      providerReported: {
        money: reported("0.0000000001234567890123456789"),
        scope: search
          ? {
              kind: "subtotal",
              includes: ["inference"],
              excludes: [],
              unknown: ["tools", "routing", "reporting_writes", "zero_data_retention", "other"],
            }
          : {
              kind: "total",
              includes: [
                "inference",
                "tools",
                "routing",
                "reporting_writes",
                "zero_data_retention",
                "other",
              ],
              excludes: [],
              unknown: [],
            },
      },
      upstreamInference: {
        total: reported("0.0000000001"),
        input: reported("0.00000000006"),
        output: reported("0.00000000004"),
      },
      localEstimate: null,
    });
    expect(value.providerCost).toEqual(
      search
        ? {
            amount: null,
            currency: "USD",
            certainty: "unknown",
            basis: "unknown",
            rateCardVersion: null,
          }
        : reported("0.0000000001234567890123456789"),
    );
  });

  it.each([true, undefined, null, "false", 0, {}, []].map((value) => [value]))(
    "does not assert an inference total for is_byok=%j",
    (is_byok) => {
      for (const search of [false, true]) {
        const value = result(
          {
            ...(is_byok === undefined ? {} : { is_byok }),
            cost: "0.00002",
            cost_details: { upstream_inference_cost: "0.0004" },
          },
          search,
        );
        expect(value.providerCost).toMatchObject({ amount: null, certainty: "unknown" });
        expect(value.costEvidence?.providerReported).toEqual({
          money: reported("0.00002"),
          scope: {
            kind: "subtotal",
            includes: [],
            excludes: is_byok === true ? ["inference"] : [],
            unknown: [
              ...(is_byok === true ? [] : ["inference"]),
              "tools",
              "routing",
              "reporting_writes",
              "zero_data_retention",
              "other",
            ],
          },
        });
        expect(value.costEvidence?.upstreamInference?.total).toEqual(reported("0.0004"));
      }
    },
  );

  it("does not infer coverage from an absent upstream amount", () => {
    const value = result({ cost: "0.1" });
    expect(value.providerCost.amount).toBeNull();
    expect(value.costEvidence?.providerReported?.scope).toMatchObject({
      kind: "subtotal",
      unknown: expect.arrayContaining(["inference"]),
    });
  });

  it("keeps missing evidence null without substituting an upstream amount", () => {
    expect(result(undefined).costEvidence).toEqual({
      providerReported: null,
      upstreamInference: null,
      localEstimate: null,
    });
    const value = result({ cost_details: { upstream_inference_prompt_cost: "0.1" } });
    expect(value.costEvidence?.upstreamInference).toEqual({
      total: null,
      input: reported("0.1"),
      output: null,
    });
    expect(value.providerCost.amount).toBeNull();
  });

  it.each([false, true])(
    "retains reported zero without inventing missing fees: search=%s",
    (search) => {
      const value = result(
        { is_byok: false, cost: "0", cost_details: { upstream_inference_cost: "0" } },
        search,
      );
      expect(value.costEvidence?.providerReported?.money).toEqual(reported("0"));
      expect(value.costEvidence?.upstreamInference).toEqual({
        total: reported("0"),
        input: null,
        output: null,
      });
      expect(value.providerCost.amount).toBe(search ? null : "0");
    },
  );

  it.each(["upstream_inference_prompt_cost", "upstream_inference_completions_cost"])(
    "drops only %s when it exceeds total and keeps its consistent sibling",
    (field) => {
      const value = result({
        ...normal().usage,
        cost: "0.2",
        cost_details: {
          upstream_inference_cost: "0.10000000000000000001",
          upstream_inference_prompt_cost: "0.05",
          upstream_inference_completions_cost: "0.05",
          [field]: "0.10000000000000000002",
        },
      });
      expect(value).toMatchObject({
        state: "completed",
        failure: null,
        answer: "Synthetic answer.",
        citations: [],
        usage: { inputTokens: 194, outputTokens: 20, completeness: "complete" },
        providerCost: { amount: "0.2", certainty: "reported" },
        costEvidence: {
          providerReported: { money: reported("0.2"), scope: { kind: "total" } },
          upstreamInference: {
            total: reported("0.10000000000000000001"),
            input: field === "upstream_inference_prompt_cost" ? null : reported("0.05"),
            output: field === "upstream_inference_completions_cost" ? null : reported("0.05"),
          },
          localEstimate: null,
        },
      });
    },
  );

  it.each(["0", "0.10000000000000000001"])(
    "keeps the paid answer and reported scope when upstream total %s is inconsistent",
    (total) => {
      for (const is_byok of [false, true, undefined]) {
        for (const search of [false, true]) {
          const usage = { ...normal().usage, is_byok, cost: "0.2" };
          const before = result(usage, search);
          const value = result(
            {
              ...usage,
              cost_details: {
                upstream_inference_cost: total,
                upstream_inference_prompt_cost: "0.10000000000000000002",
              },
            },
            search,
          );
          expect(value.state).toBe("completed");
          expect(value.failure).toBeNull();
          expect(value.answer).toBe("Synthetic answer.");
          expect(value.usage).toEqual(before.usage);
          expect(value.providerCost).toEqual(before.providerCost);
          expect(value.costEvidence?.providerReported).toEqual(
            before.costEvidence?.providerReported,
          );
          expect(value.costEvidence?.upstreamInference).toEqual({
            total: reported(total),
            input: null,
            output: null,
          });
        }
      }
    },
  );

  it("accepts equal components at different scales without adding them", () => {
    const value = result({
      cost_details: {
        upstream_inference_cost: "0.10",
        upstream_inference_prompt_cost: "0.1000",
        upstream_inference_completions_cost: "0.1",
      },
    });
    expect(value.state).toBe("completed");
    expect(value.costEvidence?.upstreamInference?.input?.amount).toBe("0.1000");
    expect(value.costEvidence?.upstreamInference?.output?.amount).toBe("0.1");
  });
});
