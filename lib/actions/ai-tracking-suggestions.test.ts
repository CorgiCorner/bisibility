import { unwrapTrackingGenerationActionResult } from "@/lib/ai-tracking/projections/generation-result";
import { SuggestionGenerationError } from "@/lib/ai-tracking/suggestions/generation-schema";
import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  generate: vi.fn(),
  scope: vi.fn().mockResolvedValue({ id: "internal-project", publicId: "prj_public" }),
  audit: vi.fn(),
}));
vi.mock("./_shared", () => ({
  getActionActor: async () => ({ id: "trusted-user", memberships: [] }),
}));
vi.mock("@/lib/api/ai-tracking-service", () => ({ trackingScope: mocks.scope }));
vi.mock("@/lib/ai-tracking/suggestions/generation", () => ({
  previewModelSuggestions: mocks.preview,
  generateModelSuggestions: mocks.generate,
}));
vi.mock("@/lib/ai-tracking/suggestions/project", () => ({ projectContextSuggestions: vi.fn() }));
vi.mock("@/lib/api/ai-tracking-audit", () => ({ auditTrackingGeneration: mocks.audit }));

import {
  generateAiTrackingSuggestionsAction,
  previewAiTrackingSuggestionsAction,
} from "./ai-tracking-suggestions";

describe("serialized model suggestion action failures", () => {
  it("returns durable unknown usage publicly through serialization and binds the trusted app actor", async () => {
    mocks.generate.mockRejectedValueOnce(
      new SuggestionGenerationError(
        409,
        "usage_reconciliation_required",
        "Reconcile provider usage before retrying.",
        "asg_abcdefghijklmnopqrstuvwx",
      ),
    );
    const result = await generateAiTrackingSuggestionsAction(
      "prj_public",
      { actorId: "forged" },
      "key",
    );
    expect(mocks.generate).toHaveBeenCalledWith(
      { projectId: "internal-project", actorId: "trusted-user", origin: { source: "app" } },
      { actorId: "forged", requirePayment: true },
      "key",
    );
    const transported = JSON.parse(JSON.stringify(result));
    expect(transported).toMatchObject({
      ok: false,
      error: {
        code: "usage_reconciliation_required",
        status: 429,
        reason: "usage_reconciliation_required",
        generationId: "asg_abcdefghijklmnopqrstuvwx",
      },
    });
    try {
      unwrapTrackingGenerationActionResult(transported);
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toMatchObject({
        code: "usage_reconciliation_required",
        status: 429,
        message: "Reconcile provider usage before retrying.",
        reason: "usage_reconciliation_required",
        generationId: "asg_abcdefghijklmnopqrstuvwx",
      });
    }
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("preserves a safe predispatch stale denial for a new reviewed preview", async () => {
    mocks.preview.mockRejectedValueOnce(
      new SuggestionGenerationError(409, "stale_preview", "Review current context again."),
    );
    expect(await previewAiTrackingSuggestionsAction("prj_public", {})).toMatchObject({
      ok: false,
      error: { reason: "stale_preview", message: "Review current context again." },
    });
    expect(mocks.scope).toHaveBeenCalledWith(
      expect.objectContaining({ id: "trusted-user" }),
      "prj_public",
    );
  });
});

it.each([
  new SuggestionGenerationError(
    409,
    "budget_missing",
    "Ask the owner to configure a monthly budget.",
  ),
  new BudgetExhaustedError({
    projectId: "internal-project",
    capCents: 0,
    spentCents: 0,
    reason: "budget_missing",
  }),
  new ProviderLookupSignal({
    ok: false,
    reason: "budget_exhausted",
    budgetReason: "budget_missing",
  }),
])("serializes missing-budget failures from suggestion preview", async (error) => {
  mocks.preview.mockRejectedValueOnce(error);
  await expect(previewAiTrackingSuggestionsAction("prj_public", {})).resolves.toMatchObject({
    ok: false,
    error: {
      code: "budget_missing",
      message: expect.stringContaining("configure a monthly budget"),
    },
  });
});

it("preserves an exhausted suggestion budget through the real result consumer", async () => {
  mocks.generate.mockRejectedValueOnce(
    new SuggestionGenerationError(
      409,
      "budget_exhausted",
      "Monthly provider budget reached.",
      "asg_budget",
    ),
  );
  const result = await generateAiTrackingSuggestionsAction("prj_public", {}, "key");
  const transported = JSON.parse(JSON.stringify(result));
  expect(transported).toMatchObject({
    ok: false,
    error: {
      code: "budget_exhausted",
      status: 429,
      reason: "budget_exhausted",
      generationId: "asg_budget",
    },
  });
  expect(() => unwrapTrackingGenerationActionResult(transported)).toThrowError(
    expect.objectContaining({
      code: "budget_exhausted",
      status: 429,
      reason: "budget_exhausted",
      generationId: "asg_budget",
      message: "Monthly provider budget reached.",
    }),
  );
});
