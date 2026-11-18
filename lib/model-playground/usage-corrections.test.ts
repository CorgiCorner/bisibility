import { modelUsageAdvisoryMeasurements, modelUsageMeasurements } from "@/lib/metering/model-usage";
import { describe, expect, it } from "vitest";
import { createModelUsageReceipt, projectModelUsage } from "./usage";
import {
  binding,
  measuredResult,
  present,
  pricedBinding,
  reportedResult,
} from "./usage.test-support";
import {
  bindModelUsageEvidence,
  loadModelUsageEvidence,
  persistModelUsageEvidence,
} from "./usage-storage";
import { usageStorageHarness } from "./usage-storage.test-support";

const f = usageStorageHarness();
async function retain(id = "attempt-1") {
  if (id !== "attempt-1") await f.seed(id);
  await f.transaction(async (tx) => {
    await bindModelUsageEvidence(tx, id, { ...binding(), attemptId: id });
    await persistModelUsageEvidence(tx, id, reportedResult("0.000123"));
  });
  return present(await loadModelUsageEvidence(f.tx, id, binding().projectId));
}

describe("native evidence review corrections", () => {
  it("C3 excludes a canonical duplicate from both token and cost history totals", async () => {
    const a = await retain();
    const b = await retain("attempt-2");
    const views = [a, b].map((loaded) =>
      projectModelUsage(present(loaded.receipt), binding().projectId, loaded),
    );
    expect(views[1]).toMatchObject({
      counted: false,
      canonicalId: "attempt-1",
      tokens: { input: null, output: null, total: null, sharedWith: "attempt-1" },
      cost: { amount: null, sharedWith: "attempt-1" },
    });
    expect(views.reduce((sum, view) => sum + (view.tokens.total ?? 0), 0)).toBe(120);
    expect(views.reduce((sum, view) => sum + Number(view.cost.amount ?? 0), 0)).toBe(0.000123);
    expect(b.receipt?.monetary.total?.amount).toBe("0.000123");
  });
  it.each([
    ["additional", "included"],
    ["unknown", "additional"],
  ] as const)("C4 refuses a token total for policy %s and usage %s", (policy, usage) => {
    const b = binding();
    b.policy.inputCacheAccounting = policy;
    const response = measuredResult();
    response.usage.inputCacheAccounting = usage;
    const receipt = createModelUsageReceipt(b, response);
    expect(
      projectModelUsage(receipt, b.projectId, { counted: true, canonicalId: null }).tokens.total,
    ).toBeNull();
  });
  it("C5 gives native evidence a status distinct from legacy recorded money", async () => {
    await retain();
    expect(await f.find("attempt-1")).toMatchObject({ measurementStatus: "native_complete" });
  });
  it.each(["provider_total_conflict", "upstream_exceeds_total"] as const)(
    "C6 retains money evidence but refuses %s",
    (reason) => {
      const response = reportedResult("0.0001");
      if (reason === "provider_total_conflict")
        response.providerCost = { ...response.providerCost, amount: "0.0002" };
      else
        response.costEvidence.upstreamInference = {
          total: { ...response.providerCost, amount: "0.0002" },
          input: null,
          output: null,
        };
      const receipt = createModelUsageReceipt(binding(), response);
      expect(receipt.monetary).toEqual({
        status: "unavailable",
        total: null,
        conflictReason: reason,
      });
      expect(receipt.evidence?.costEvidence).toEqual(response.costEvidence);
      expect(
        projectModelUsage(receipt, binding().projectId, { counted: true, canonicalId: null }),
      ).toMatchObject({
        reconciliationRequired: true,
        monetaryConflict: reason,
      });
    },
  );
  it("C7 loads an unbound row as unknown exposure", async () => {
    expect(await loadModelUsageEvidence(f.tx, "attempt-1", binding().projectId)).toMatchObject({
      receipt: null,
      counted: true,
      canonicalId: null,
      usageStatus: "unknown",
      additionalExposure: "unknown",
      reconciliationRequired: true,
      automaticPaidRetryAllowed: false,
    });
  });
  it("accepts equivalent decimal money and a smaller upstream subtotal", () => {
    const response = reportedResult("0.0001");
    response.providerCost = { ...response.providerCost, amount: "0.0001000" };
    response.costEvidence.upstreamInference = {
      total: { ...response.providerCost, amount: "0.00009" },
      input: null,
      output: null,
    };
    expect(createModelUsageReceipt(binding(), response).monetary).toEqual({
      status: "reported",
      total: present(response.costEvidence.providerReported).money,
    });
  });
  it.each(["9".repeat(79), `0.${"0".repeat(30)}1`])(
    "C8 retains real usage with extreme rate %s",
    async (rate) => {
      const b = pricedBinding();
      b.rateCard.rates[0].usdPerUnit = rate;
      const receipt = createModelUsageReceipt(b, measuredResult());
      expect(receipt.budgetValuation).toMatchObject({ certainty: "unknown", cents: null });
      expect(receipt.evidence?.usage.inputTokens).toBe(100);
      expect(modelUsageMeasurements(receipt)).toContainEqual({
        unit: "input_tokens",
        certainty: "measured",
        quantity: { unit: "input_tokens", value: 100n, scale: 0 },
      });
      expect(modelUsageAdvisoryMeasurements(receipt)).toEqual([]);
      await f.transaction(async (tx) => {
        await bindModelUsageEvidence(tx, "attempt-1", b);
        await persistModelUsageEvidence(tx, "attempt-1", measuredResult());
      });
      expect(
        (await loadModelUsageEvidence(f.tx, "attempt-1", b.projectId))?.receipt?.evidence?.usage
          .inputTokens,
      ).toBe(100);
    },
  );
});
