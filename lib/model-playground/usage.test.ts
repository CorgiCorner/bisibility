import { describe, expect, it } from "vitest";
import { createModelUsageReceipt, projectModelUsage, validateModelUsageReceipt } from "./usage";
import {
  binding,
  measuredResult,
  present,
  pricedBinding,
  reportedResult,
} from "./usage.test-support";
import { modelUsageBindingSchema } from "./usage-contract";

const counted = { counted: true, canonicalId: null };

describe("native model usage evidence", () => {
  it("completes measured tokens without inventing a monetary receipt", () => {
    const receipt = createModelUsageReceipt(binding(), measuredResult());
    expect(receipt.usageStatus).toBe("complete");
    expect(receipt.monetary).toEqual({ status: "unavailable", total: null });
    expect(projectModelUsage(receipt, "project-example", counted)).toMatchObject({
      tokens: { input: 100, output: 20, total: 120, reasoning: 5, cacheRead: 10 },
      cost: { basis: "unavailable", certainty: "unknown", amount: null },
      reconciliationRequired: false,
      automaticPaidRetryAllowed: false,
    });
  });
  it("values measured usage exactly without double counting cache or reasoning", () => {
    const receipt = createModelUsageReceipt(pricedBinding(), measuredResult());
    expect(receipt.budgetValuation).toEqual({
      certainty: "estimated",
      cents: "0.0131",
      rateCardVersion: "rates-v1",
    });
    expect(receipt.monetary.status).toBe("unavailable");
    expect(projectModelUsage(receipt, "project-example", counted).cost).toMatchObject({
      basis: "rate_card",
      certainty: "estimated",
      amount: "0.000131",
    });
  });
  it.each([
    "inputTokens",
    "outputTokens",
    "cacheReadInputTokens",
    "cacheWriteInputTokens",
    "searchCalls",
  ] as const)("keeps missing billable %s partial", (dimension) => {
    const expected = binding();
    if (dimension === "searchCalls") {
      expected.column.settings.search = { mode: "openrouter_web_exa", maxCalls: 1 };
      expected.policy.billableDimensions.push("searchCalls");
    }
    const response = measuredResult();
    response.column = expected.column;
    response.usage[dimension] = null;
    response.usage.completeness = "partial";
    const receipt = createModelUsageReceipt(expected, response);
    expect(receipt.usageStatus).toBe("partial");
    expect(projectModelUsage(receipt, expected.projectId, counted).reconciliationRequired).toBe(
      true,
    );
    expect(receipt.budgetValuation.cents).toBeNull();
  });
  it("requires all cache TTL quantities and preserves additional-cache token totals", () => {
    const expected = binding();
    expected.policy.inputCacheAccounting = "additional";
    expected.policy.cacheWriteTtls = [300, 3600];
    const response = measuredResult();
    response.usage.inputCacheAccounting = "additional";
    response.usage.cacheWriteInputTokens = 5;
    response.usage.cacheWrites = [{ ttlSeconds: 300, tokens: 5 }];
    expect(createModelUsageReceipt(expected, response).usageStatus).toBe("partial");
    response.usage.cacheWrites.push({ ttlSeconds: 3600, tokens: 0 });
    const receipt = createModelUsageReceipt(expected, response);
    expect(receipt.usageStatus).toBe("complete");
    expect(projectModelUsage(receipt, expected.projectId, counted).tokens.total).toBe(135);
  });
  it("uses returned search counts above the requested cap in advisory valuation", () => {
    const expected = pricedBinding();
    expected.column.settings.search = { mode: "openrouter_web_exa", maxCalls: 1 };
    expected.policy.billableDimensions.push("searchCalls");
    expected.rateCard.rates.push({ dimension: "searchCalls", usdPerUnit: "0.005" });
    const response = measuredResult();
    response.column = expected.column;
    response.usage.searchCalls = 3;
    expect(createModelUsageReceipt(expected, response).budgetValuation.cents).toBe("1.5131");
  });
  it("does not trust complete labels over missing dimensions or adapter partial flags", () => {
    const response = measuredResult();
    response.usage.cacheReadInputTokens = null;
    expect(createModelUsageReceipt(binding(), response).usageStatus).toBe("partial");
    response.usage.cacheReadInputTokens = 10;
    response.usage.completeness = "partial";
    expect(createModelUsageReceipt(binding(), response).usageStatus).toBe("partial");
  });
  it("keeps price unavailable with missing rates or only a subtotal rate scope", () => {
    const expected = pricedBinding();
    expected.rateCard.rates.pop();
    expect(createModelUsageReceipt(expected, measuredResult()).budgetValuation.cents).toBeNull();
    const subtotal = pricedBinding();
    subtotal.rateCard.scope.kind = "subtotal";
    expect(createModelUsageReceipt(subtotal, measuredResult()).budgetValuation.cents).toBeNull();
  });
  it("only subtracts separately billed cache and reasoning from base token rates", () => {
    const expected = pricedBinding();
    expected.policy.billableDimensions = ["inputTokens", "outputTokens"];
    expected.rateCard.rates = expected.rateCard.rates.slice(0, 2);
    expect(createModelUsageReceipt(expected, measuredResult()).budgetValuation.cents).toBe("0.014");
    expected.policy.billableDimensions.push("reasoningTokens");
    expected.rateCard.rates.push({ dimension: "reasoningTokens", usdPerUnit: "0.000004" });
    expect(createModelUsageReceipt(expected, measuredResult()).budgetValuation.cents).toBe("0.015");
  });
  it("projects search content tokens without guessing whether they are included", () => {
    const expected = binding();
    expected.policy.billableDimensions.push("searchContentTokens");
    expected.policy.searchContentAccounting = "additional";
    const response = measuredResult();
    response.usage.searchContentTokens = 7;
    const read = () =>
      projectModelUsage(createModelUsageReceipt(expected, response), expected.projectId, counted)
        .tokens;
    expect(read()).toMatchObject({ searchContent: 7, total: 127, cacheWrites: [] });
    expected.policy.searchContentAccounting = "included";
    expect(read().total).toBe(120);
    expected.policy.searchContentAccounting = "unknown";
    expect(read().total).toBeNull();
  });
  it("keeps missing post-dispatch evidence unknown and forbids replay", () => {
    const receipt = createModelUsageReceipt(binding(), null);
    expect(receipt.usageStatus).toBe("unknown");
    expect(projectModelUsage(receipt, "project-example", counted)).toMatchObject({
      reconciliationRequired: true,
      automaticPaidRetryAllowed: false,
    });
  });
  it.each(["amount", "model", "source", "estimated_money"])(
    "rejects a forged %s receipt",
    (field) => {
      const expected = binding();
      const receipt = createModelUsageReceipt(expected, reportedResult());
      if (field === "amount") present(receipt.monetary.total).amount = "999";
      if (field === "model") receipt.binding.column.modelId = "forged-model";
      if (field === "source") receipt.binding.column.sourceKind = "consumer" as "raw_model";
      if (field === "estimated_money")
        present(receipt.monetary.total).certainty = "estimated" as "reported";
      expect(() => validateModelUsageReceipt(receipt, expected)).toThrow(
        field === "source"
          ? /Invalid input: expected.*raw_model/
          : field === "estimated_money"
            ? "Money must retain its amount certainty and provenance."
            : "Native receipt differs from its retained evidence or binding.",
      );
    },
  );
  it.each(["dataforseo", "hosted", "consumer"])("refuses %s at the native entry point", (kind) => {
    const expected = binding();
    if (kind === "dataforseo") expected.column.providerId = kind as "openrouter";
    if (kind === "hosted") expected.fundingSource = "platform" as "byok";
    if (kind === "consumer") expected.column.sourceKind = kind as "raw_model";
    expect(modelUsageBindingSchema.safeParse(expected).success).toBe(false);
    expect(() => createModelUsageReceipt(expected, measuredResult())).toThrow(
      kind === "hosted"
        ? "Funding binding is incomplete or inconsistent."
        : kind === "consumer"
          ? /Invalid input: expected.*raw_model/
          : "Invalid option: expected one of",
    );
  });
  it("refuses a wrong-project read and a substituted response model", () => {
    const receipt = createModelUsageReceipt(binding(), measuredResult());
    expect(() => projectModelUsage(receipt, "other-project", counted)).toThrow(
      "Native usage project mismatch.",
    );
    const response = measuredResult();
    response.actualModelId = "another-model";
    expect(() => createModelUsageReceipt(binding(), response)).toThrow(
      "Native usage does not belong to the frozen model column.",
    );
  });
  it("uses only provider-reported totals, retaining subtotals and upstream evidence", () => {
    const response = reportedResult();
    expect(createModelUsageReceipt(binding(), response).monetary.total?.amount).toBe("0.00012345");
    present(response.costEvidence.providerReported).scope = {
      kind: "subtotal",
      includes: ["inference"],
      excludes: [],
      unknown: ["tools", "routing", "reporting_writes", "zero_data_retention", "other"],
    };
    response.costEvidence.upstreamInference = {
      total: response.providerCost,
      input: null,
      output: null,
    };
    const receipt = createModelUsageReceipt(binding(), response);
    expect(receipt.monetary.status).toBe("unavailable");
    expect(projectModelUsage(receipt, "project-example", counted).costEvidence).toEqual(
      response.costEvidence,
    );
  });
  it("never treats a gateway subtotal as zero additional own-key exposure", () => {
    const expected = binding();
    expected.column.providerId = "vercel_ai_gateway";
    const response = reportedResult();
    response.column = expected.column;
    const receipt = createModelUsageReceipt(expected, response);
    expect(receipt.additionalExposure).toBe("unknown");
    expect(receipt.monetary.status).toBe("unavailable");
    expect(projectModelUsage(receipt, expected.projectId, counted).reconciliationRequired).toBe(
      true,
    );
  });
  it("retains an upstream subtotal and a local estimate without promoting either to total money", () => {
    const response = reportedResult();
    response.costEvidence = {
      providerReported: null,
      upstreamInference: { total: response.providerCost, input: null, output: null },
      localEstimate: {
        amount: "8",
        currency: "USD",
        certainty: "estimated",
        basis: "rate_card",
        rateCardVersion: "rates-v1",
      },
    };
    const receipt = createModelUsageReceipt(binding(), response);
    expect(receipt.monetary.status).toBe("unavailable");
    expect(receipt.budgetValuation.cents).toBeNull();
  });
});

it("retains only the reviewed OpenAI alias-to-snapshot pair as the same requested model", () => {
  const expected = binding();
  expected.column.providerId = "openai";
  expected.column.modelId = "gpt-5";
  const response = measuredResult();
  response.column = expected.column;
  response.actualProviderId = "openai";
  response.actualModelId = "gpt-5-2025-08-07";
  const receipt = createModelUsageReceipt(expected, response);
  expect(receipt.evidence?.actualModelId).toBe("gpt-5-2025-08-07");
  expect(validateModelUsageReceipt(receipt, expected)).toEqual(receipt);
  response.actualModelId = "gpt-5-2099-01-01";
  expect(() => createModelUsageReceipt(expected, response)).toThrow("frozen model column");
  response.actualModelId = "gpt-5-2025-08-07";
  response.actualProviderId = "anthropic";
  expect(() => createModelUsageReceipt(expected, response)).toThrow("frozen model column");
});
