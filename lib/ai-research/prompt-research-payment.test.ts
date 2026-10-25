import type { SerpProvider } from "@/lib/providers/types";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ quote: vi.fn(), availability: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 7)] }));
vi.mock("@/lib/action-payment/current-route", () => ({
  currentPaymentRoute: async () => ({ id: "connection", provider: "dataforseo" }),
}));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({ preflightProviderBudget: vi.fn() }));
vi.mock("@/lib/action-payment/deployment-extension", () => ({
  quoteDeploymentPayment: mocks.quote,
  readDeploymentPaymentAvailability: mocks.availability,
  readDeploymentPayment: mocks.read,
  assertDeploymentPayment: vi.fn(),
}));
vi.mock("@/lib/provider-usage/byok-evidence-storage", () => ({
  loadByokEvidence: vi.fn(async () => ({
    measurementStatus: "recorded",
    costMeasurement: "recorded",
    quantityMeasurement: "recorded",
    costCents: "10",
    usageQuantity: "1",
  })),
}));

import { capabilities } from "./catalog-fixtures.test-support";
import { promptResearchSchema } from "./prompt-research-schema";
import { prepareResearchAiPayment } from "./research-payment";

const input = promptResearchSchema.parse({
  keyword: "tools",
  max_cost_cents: 50,
  estimate_only: true,
});
const context = { projectId: "project", actorId: "actor", origin: { source: "app" as const } };
const admission = { policy: "current_catalog" as const, estimate: 20, capabilities };
function source(credentialSource: "own" | "hosted") {
  return {
    project: { id: "project", ownerId: "owner" },
    connection: {
      id: "connection",
      publicId: "conn_a00000000000000000000000",
      provider: "dataforseo",
      credentialsEncrypted: "fictional",
      credentialSource,
    },
    provider: {
      id: "dataforseo",
      label: "DataForSEO",
      payment: { unit: { kind: "currency", code: "USD" }, basis: "provider_cost" },
    } as SerpProvider,
  } as unknown as Parameters<typeof prepareResearchAiPayment>[3];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.quote.mockResolvedValue({ authority: "policy", amount: "25" });
  mocks.availability.mockResolvedValue({ availability: { allowed: true, reason: null } });
  mocks.read.mockResolvedValue({ charge: "12.5", providerCostCents: "10" });
});
it.each(["own", "hosted"] as const)(
  "uses the shared %s quote, consent and settlement",
  async (route) => {
    const payer = source(route);
    const preview = (await prepareResearchAiPayment(
      context,
      "prompt_research",
      input,
      payer,
      admission,
    ))!;
    expect(preview.quote.option.fundingSource).toBe(route === "own" ? "byok" : "platform");
    expect(preview.quote.charge.value).toBe(route === "own" ? "0.2" : "25");
    const payment = (await prepareResearchAiPayment(
      context,
      "prompt_research",
      {
        ...input,
        estimate_only: false,
        require_payment: true,
        accepted_payment: { quote_token: preview.quote.quoteToken },
      },
      payer,
      admission,
    ))!;
    const child = payment.child("visibility")!;
    expect(child.snapshot.credentialSource).toBe(route);
    if (route === "own") {
      await child.record({ attemptIds: ["attempt"] });
      expect(payment.receipt()).toMatchObject({
        state: "settled",
        charge: { value: "0.1", certainty: "measured" },
      });
    } else {
      await child.record({ operationKey: "execution" });
      expect(payment.receipt()).toMatchObject({
        state: "settled",
        charge: { value: "12.5", certainty: "measured" },
      });
    }
  },
);
it("shows insufficient Credits and refuses execution before a paid child exists", async () => {
  mocks.availability.mockResolvedValue({
    availability: { allowed: false, reason: "insufficient_credits" },
  });
  const preview = (await prepareResearchAiPayment(
    context,
    "prompt_research",
    input,
    source("hosted"),
    admission,
  ))!;
  expect(preview.quote.availability).toMatchObject({
    allowed: false,
    reason: "insufficient_credits",
  });
  const refused = (await prepareResearchAiPayment(
    context,
    "prompt_research",
    {
      ...input,
      estimate_only: false,
      require_payment: true,
      accepted_payment: { quote_token: preview.quote.quoteToken },
    },
    source("hosted"),
    admission,
  ))!;
  expect(() => refused.child("visibility")).toThrow("payment_unavailable");
});
it("returns a free cached quote independently of historic dataset price", async () => {
  const payment = (await prepareResearchAiPayment(
    context,
    "prompt_research",
    input,
    source("own"),
    admission,
    true,
  ))!;
  expect(payment.quote.charge).toMatchObject({ value: "0", certainty: "free" });
});
