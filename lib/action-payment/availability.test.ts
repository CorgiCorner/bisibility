import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionPaymentAvailability } from "./availability";
import type { ActionPaymentQuote } from "./contract";

const mocks = vi.hoisted(() => ({ budget: vi.fn(), wallet: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({
  preflightProviderBudget: mocks.budget,
}));
vi.mock("./deployment-extension", () => ({ readDeploymentPaymentAvailability: mocks.wallet }));
const quote = {
  option: { fundingSource: "platform" },
  charge: { value: "80", certainty: "estimate" },
} as ActionPaymentQuote;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.wallet.mockResolvedValue({
    availability: { allowed: false, reason: "insufficient_credits", remedyHref: "/billing" },
  });
});
describe("quote denial precedence", () => {
  it("checks frozen customer charge against budgets before offering top-up", async () => {
    mocks.budget.mockRejectedValue(
      new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" }),
    );
    const result = await actionPaymentAvailability({
      quote,
      projectId: "project",
      actorId: "owner",
      connectionId: "connection",
      provider: "future",
      source: "app",
      providerCostCents: 60,
    });
    expect(result.availability).toEqual({ allowed: false, reason: "budget_exhausted" });
    expect(mocks.budget).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCustomerCents: 80, estimatedCostCents: 60 }),
    );
  });
  it("never interprets an unavailable budget read as permission to top up", async () => {
    mocks.budget.mockRejectedValue(new Error("read failed"));
    const result = await actionPaymentAvailability({
      quote,
      projectId: "project",
      connectionId: "connection",
      provider: "future",
      source: "app",
      providerCostCents: 60,
    });
    expect(result.availability).toEqual({
      allowed: false,
      reason: "usage_reconciliation_required",
    });
  });
  it("cache-only free read does not consume a paid budget", async () => {
    await actionPaymentAvailability({
      quote: { ...quote, charge: { ...quote.charge, value: "0", certainty: "free" } },
      projectId: "project",
      connectionId: "connection",
      provider: "future",
      source: "app",
      providerCostCents: 0,
    });
    expect(mocks.budget).not.toHaveBeenCalled();
  });
});
