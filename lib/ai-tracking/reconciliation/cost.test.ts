import { samplePlan } from "@/lib/ai-tracking/execution/fixture";
import { expect, it } from "vitest";
import { trackingCostReceipt, usd } from "./cost";

it("retains the provider decimal projection without imposing an eight-place rounding limit", () => {
  expect(usd(0.00000000123)).toBe("0.00000000123");
  expect(usd(0.003234567891)).toBe("0.003234567891");
});

it("uses task cost once, including money_spent, and never adds envelope cost", () => {
  const receipt = trackingCostReceipt({
    plan: samplePlan(),
    envelope: { cost: 0.006, tasks: [{ cost: 0.0032, result: [{ money_spent: 0.003 }] }] },
    ledgerId: "ledger",
    retrieval: false,
  });
  expect(receipt.amountUsd).toBe("0.0032");
});
it("uses the live base fee when a retained live task is reconciled through free GET", () => {
  expect(
    trackingCostReceipt({
      plan: samplePlan({ endpoint: "ai_optimization/chat_gpt/llm_responses/live" }),
      envelope: { tasks: [{ cost: 0, result: [{ money_spent: 0.003 }] }] },
      ledgerId: "ledger",
      retrieval: true,
    }),
  ).toEqual({ providerCostEntryId: "ledger", amountUsd: "0.0036", state: "derived" });
});
it("retains a queue deposit on GET zero, then derives final base plus model cost", () => {
  const plan = samplePlan();
  const deposit = trackingCostReceipt({
    plan,
    envelope: { tasks: [{ cost: 0.0102 }] },
    ledgerId: "ledger",
    retrieval: false,
  });
  expect(deposit).toEqual({
    providerCostEntryId: "ledger",
    amountUsd: "0.0102",
    state: "refund_pending",
  });
  const freeGet = trackingCostReceipt({
    plan,
    envelope: { tasks: [{ cost: 0 }] },
    ledgerId: "ledger",
    previous: deposit,
    retrieval: true,
  });
  expect(freeGet).toEqual(deposit);
  const final = trackingCostReceipt({
    plan,
    envelope: { tasks: [{ cost: 0, result: [{ money_spent: 0.003 }] }] },
    ledgerId: "ledger",
    previous: deposit,
    retrieval: true,
  });
  expect(final).toEqual({ providerCostEntryId: "ledger", amountUsd: "0.0032", state: "derived" });
});
