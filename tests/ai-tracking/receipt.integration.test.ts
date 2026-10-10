import type { CostReceipt } from "@/lib/ai-tracking/contract";
import {
  trackingExportProjection,
  trackingSampleProjection,
} from "@/lib/ai-tracking/projections/evidence";
import { trackingCostReceipt } from "@/lib/ai-tracking/reconciliation/cost";
import { describe, expect, it } from "vitest";

type Sample = Parameters<typeof trackingSampleProjection>[0];
const projectReceipt = (receipt: CostReceipt) =>
  ({
    publicId: "asm_cost",
    runId: "run",
    promptRevisionId: "revision",
    promptRevision: { publicId: "apr_cost", text: "Exact question" },
    run: { publicId: "air_cost" },
    measurement: "unknown",
    source: "model_api",
    engine: "chat_gpt",
    plan: { promptText: "Exact question", promptRevisionId: "revision" },
    evidence: null,
    answerText: null,
    raw: null,
    citations: [],
    receipt,
  }) as unknown as Sample;
const plan = {
  source: "model_api" as const,
  endpoint: "ai_optimization/chat_gpt/llm_responses/task_post",
};
describe("provider receipt and tracking surfaces agree", () => {
  it("projects derived final cost instead of adding deposit or poll envelope", () => {
    const previous = trackingCostReceipt({
      plan,
      envelope: { cost: 0.0102, tasks: [{ cost: 0.0102 }] },
      ledgerId: "ledger",
      retrieval: false,
    });
    const receipt = trackingCostReceipt({
      plan,
      previous,
      envelope: { cost: 42, tasks: [{ cost: 0, result: [{ money_spent: 0.003 }] }] },
      ledgerId: "ledger",
      retrieval: true,
    });
    expect(previous).toMatchObject({ amountUsd: "0.0102", state: "refund_pending" });
    expect(receipt).toEqual({
      amountUsd: "0.0032",
      state: "derived",
      providerCostEntryId: "ledger",
    });
    expect(trackingSampleProjection(projectReceipt(receipt))).toMatchObject({
      costUsd: "0.0032",
      costState: "derived",
    });
    expect(trackingExportProjection(projectReceipt(receipt))).toMatchObject({
      costUsd: "0.0032",
      costState: "derived",
    });
  });
  it("retains the unresolved deposit when a free poll supplies no model receipt", () => {
    const previous: CostReceipt = {
      amountUsd: "0.0102",
      state: "refund_pending",
      providerCostEntryId: "ledger",
    };
    const receipt = trackingCostReceipt({
      plan,
      previous,
      envelope: { tasks: [{ cost: 0, result: [] }] },
      ledgerId: "ledger",
      retrieval: true,
    });
    expect(receipt).toEqual(previous);
    expect(trackingSampleProjection(projectReceipt(receipt))).toMatchObject({
      costUsd: "0.0102",
      costState: "refund_pending",
    });
  });
  it("uses the live endpoint base for a recovered live task free GET", () => {
    const receipt = trackingCostReceipt({
      plan: { ...plan, endpoint: "ai_optimization/chat_gpt/llm_responses/live" },
      envelope: { tasks: [{ cost: 0, result: [{ money_spent: 0.003 }] }] },
      ledgerId: "ledger",
      retrieval: true,
    });
    expect(receipt).toMatchObject({ amountUsd: "0.0036", state: "derived" });
    expect(trackingExportProjection(projectReceipt(receipt)).costUsd).toBe("0.0036");
  });
  it("keeps ambiguous receipt unknown across projections instead of treating it as zero", () => {
    const receipt = trackingCostReceipt({
      plan,
      envelope: {},
      ledgerId: "ledger",
      retrieval: false,
    });
    expect(receipt).toEqual({ amountUsd: null, state: "unknown", providerCostEntryId: "ledger" });
    expect(trackingSampleProjection(projectReceipt(receipt)).costUsd).toBeNull();
    expect(trackingExportProjection(projectReceipt(receipt)).costState).toBe("unknown");
  });
});
