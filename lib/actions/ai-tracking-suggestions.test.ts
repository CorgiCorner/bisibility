import { unwrapTrackingGenerationActionResult } from "@/lib/ai-tracking/projections/generation-result";
import { SuggestionGenerationError } from "@/lib/ai-tracking/suggestions/generation-schema";
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
      { actorId: "forged" },
      "key",
    );
    const transported = JSON.parse(JSON.stringify(result));
    expect(transported).toMatchObject({
      ok: false,
      error: {
        status: 409,
        reason: "usage_reconciliation_required",
        generationId: "asg_abcdefghijklmnopqrstuvwx",
      },
    });
    try {
      unwrapTrackingGenerationActionResult(transported);
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toMatchObject({
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
