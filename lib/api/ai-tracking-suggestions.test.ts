import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiContext } from "./context";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), generate: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/ai-tracking/suggestions/generation", () => ({
  previewModelSuggestions: mocks.preview,
  generateModelSuggestions: mocks.generate,
}));
vi.mock("./ai-tracking-audit", () => ({ auditTrackingGeneration: mocks.audit }));

import { SuggestionGenerationError } from "@/lib/ai-tracking/suggestions/generation-schema";
import { handleAiTrackingSuggestionGeneration } from "./ai-tracking-suggestions";

const idempotencyKey = "00000000-0000-4000-8000-000000000071";
const input = {
  configuration: {
    provider: "dataforseo",
    engine: "chat_gpt",
    model: "gpt-5-mini",
    languageCode: "en",
    maxOutputTokens: 1024,
    advisoryCostLimitCents: 50,
  },
  inputSnapshot: {
    context: {
      business: "Example",
      audience: "Teams",
      products: "Analytics",
      goals: "Visibility",
      agentRules: "Review claims",
    },
    competitors: [],
  },
};
const preview = {
  ...input,
  version: 1,
  snapshotHash: "a".repeat(64),
  estimatedCostCents: 0.5,
  estimateKind: "forecast",
  isGuaranteedMaximum: false,
  credentialConnectionId: "conn_a00000000000000000000000",
  credentialVersion: "v1",
  budgetRevision: "b1",
  consentRevision: "c1",
  expiresAt: "2026-10-08T23:00:00Z",
  limitations: [],
};
const actor = { id: "trusted_actor" };
const project = { id: "internal_project", publicId: "prj_a00000000000000000000000" };
function context(headers: Record<string, string> = {}): ApiContext {
  return {
    method: "POST",
    req: new Request("https://example.test", { method: "POST", headers }),
    headers: new Headers(),
    origin: {
      source: "mcp",
      credentialId: "trusted_key",
      credentialKind: "project_key",
      surface: "programmatic",
    },
  } as ApiContext;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue(preview);
  mocks.generate.mockResolvedValue({
    generationId: "asg_a00000000000000000000000",
    drafts: [],
    costUsd: null,
    costState: "unknown",
    method: "model_generated_hypothesis",
    limitations: [],
  });
});
describe("AI suggestion generation REST boundary", () => {
  it("returns a spend-free frozen preview with original credential attribution and no audit mutation", async () => {
    const response = await handleAiTrackingSuggestionGeneration(
      context(),
      actor,
      project,
      "preview",
      input,
    );
    expect(await response?.json()).toMatchObject({
      data: {
        input_snapshot: { context: { agent_rules: "Review claims" } },
        estimate_kind: "forecast",
        is_guaranteed_maximum: false,
      },
    });
    expect(mocks.preview).toHaveBeenCalledWith(
      {
        projectId: project.id,
        actorId: actor.id,
        origin: { source: "mcp", credential: { id: "trusted_key", kind: "project_key" } },
      },
      input,
    );
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("requires explicit consent and UUID header, preserving the exact snapshot and original actor", async () => {
    expect(
      (
        await handleAiTrackingSuggestionGeneration(context(), actor, project, "generate", {
          preview,
          consent: true,
        })
      )?.status,
    ).toBe(400);
    await expect(
      handleAiTrackingSuggestionGeneration(
        context({ "Idempotency-Key": idempotencyKey }),
        actor,
        project,
        "generate",
        { preview, consent: false },
      ),
    ).rejects.toThrow();
    expect(mocks.generate).not.toHaveBeenCalled();
    const response = await handleAiTrackingSuggestionGeneration(
      context({ "Idempotency-Key": idempotencyKey }),
      actor,
      project,
      "generate",
      { preview, consent: true },
    );
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: actor.id }),
      { preview, consent: true },
      idempotencyKey,
    );
    expect(mocks.audit).toHaveBeenCalledWith(actor, project, "asg_a00000000000000000000000");
    expect(await response?.json()).toMatchObject({
      data: {
        generation_id: "asg_a00000000000000000000000",
        cost_usd: null,
        cost_state: "unknown",
      },
    });
  });
  it("rejects oversized review and surfaces stale preview conflicts without generation audit", async () => {
    await expect(
      handleAiTrackingSuggestionGeneration(context(), actor, project, "preview", {
        ...input,
        inputSnapshot: {
          ...input.inputSnapshot,
          context: { ...input.inputSnapshot.context, business: "x".repeat(5000) },
        },
      }),
    ).rejects.toThrow("5000");
    expect(mocks.preview).not.toHaveBeenCalled();
    mocks.generate.mockRejectedValueOnce(
      new SuggestionGenerationError(
        409,
        "stale_preview",
        "Review the changed preview again.",
        "asg_a00000000000000000000000",
      ),
    );
    const response = await handleAiTrackingSuggestionGeneration(
      context({ "Idempotency-Key": idempotencyKey }),
      actor,
      project,
      "generate",
      { preview, consent: true },
    );
    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({
      errors: { reason: "stale_preview", generation_id: "asg_a00000000000000000000000" },
    });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
