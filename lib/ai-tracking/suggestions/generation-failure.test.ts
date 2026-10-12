import {
  MISSING_PROJECT_BUDGET_MESSAGE,
  UNRESOLVED_USAGE_MESSAGE,
} from "@/lib/metering/budget-denial";
import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { beforeEach, expect, it, vi } from "vitest";
import { failSuggestionGeneration } from "./generation-failure";
import type { GenerationExecutionState } from "./model-execution";

const mocks = vi.hoisted(() => ({ prove: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/ai-tracking/stores/suggestion-generations", () => ({
  proveNoDispatch: mocks.prove,
  persistSuggestionGeneration: mocks.persist,
}));
vi.mock("./generation-receipt", () => ({ nativeGenerationReceipt: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prove.mockResolvedValue(true);
});
const state: GenerationExecutionState = {
  dispatched: false,
  barrier: false,
  nativeId: null,
  receipt: {
    providerCostEntryId: null,
    state: "unknown",
    amountUsd: null,
    connectionId: "connection",
    credentialVersion: "v1",
  },
};
it.each([
  [
    undefined,
    "generation_refused",
    "Generation was refused before transport. Review provider availability, budget and shared capacity.",
  ],
  ["budget_missing" as const, "budget_missing", MISSING_PROJECT_BUDGET_MESSAGE],
  [
    "usage_reconciliation_required" as const,
    "usage_reconciliation_required",
    UNRESOLVED_USAGE_MESSAGE,
  ],
])("retains the generation refusal contract for %s", async (budgetReason, reason, message) => {
  await expect(
    failSuggestionGeneration(
      { projectId: "project", origin: { source: "app" } },
      { id: "generation", publicId: "atg_public", attemptId: "attempt" },
      state,
      {} as Parameters<typeof failSuggestionGeneration>[3],
      new ProviderLookupSignal({
        ok: false,
        reason: "budget_exhausted",
        ...(budgetReason ? { budgetReason } : {}),
      }),
    ),
  ).rejects.toMatchObject({ reason, message, generationId: "atg_public" });
  expect(mocks.prove).toHaveBeenCalledWith(
    "project",
    "generation",
    expect.objectContaining({ attemptId: "attempt", expectedState: "claimed" }),
  );
  expect(mocks.persist).not.toHaveBeenCalled();
});
