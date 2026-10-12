import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("./_shared", () => ({ getActionActor: async () => ({ id: "actor" }) }));
vi.mock("@/lib/api/ai-tracking-service", () => ({
  trackingScope: async () => ({ id: "project" }),
  trackingLaunch: mocks.launch,
}));
vi.mock("@/lib/api/ai-tracking-audit", () => ({ auditTrackingRun: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { launchAiTrackingAction, previewAiTrackingAction } from "./ai-tracking";

beforeEach(() => vi.clearAllMocks());
it.each([previewAiTrackingAction, launchAiTrackingAction])(
  "returns a missing-budget result from tracking admission",
  async (action) => {
    mocks.launch.mockRejectedValueOnce(
      new ProviderLookupSignal({
        ok: false,
        reason: "budget_exhausted",
        budgetReason: "budget_missing",
      }),
    );
    await expect(action("prj_project", {})).resolves.toMatchObject({
      ok: false,
      error: { code: "budget_missing", status: 429 },
    });
  },
);
