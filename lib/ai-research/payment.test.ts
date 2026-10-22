import type { SerpProvider } from "@/lib/providers/types";
import { afterEach, expect, it, vi } from "vitest";
import {
  aiOwnPaymentQuote,
  aiPaymentGuard,
  aiPaymentReceipt,
  assertAiPaymentDefinition,
  bindAiPaymentExecution,
  readAiPaymentConsent,
} from "./payment";

vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 7)] }));
afterEach(() => vi.useRealTimers());
const source = {
  project: { id: "project", ownerId: "owner" },
  connection: {
    id: "connection",
    publicId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
    provider: "future-ai",
    credentialSource: "own" as const,
    credentialsEncrypted: "fictional-cipher",
  },
  provider: {
    id: "future-ai",
    label: "Future AI",
    payment: { unit: { kind: "currency", code: "USD" }, basis: "provider_cost" },
  } as SerpProvider,
};
const input = {
  source,
  actorId: "actor",
  entrySource: "app",
  feature: "prompt_explorer",
  definition: { prompt: "question", revision: 1 },
  estimatedCostCents: 0.4,
};
it("keeps an advisory USD forecast separate from accepted durable authority", () => {
  const quote = aiOwnPaymentQuote(input);
  expect(quote.payment.charge).toEqual({
    value: "0.004",
    unit: { kind: "currency", code: "USD" },
    certainty: "estimate",
  });
  const consent = quote.accept({ quoteToken: quote.payment.quoteToken }, true);
  const retained = readAiPaymentConsent(bindAiPaymentExecution(consent, "run-1"));
  expect(retained).toMatchObject({
    policy: "advisory",
    executionId: "run-1",
    option: { fundingSource: "byok" },
  });
  expect(retained).not.toHaveProperty("costLimit");
});
it("checks quote expiry only when accepting, not when executing retained consent", () => {
  const quote = aiOwnPaymentQuote(input),
    consent = bindAiPaymentExecution(
      quote.accept({ quoteToken: quote.payment.quoteToken }),
      "run-1",
    );
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.now() + 700_000));
  expect(() => quote.accept({ quoteToken: quote.payment.quoteToken }, true)).toThrow(
    "payment_quote_expired",
  );
  expect(() =>
    assertAiPaymentDefinition(consent, {
      projectId: "project",
      actorId: "actor",
      feature: input.feature,
      definition: input.definition,
      scope: "manual",
      executionId: "run-1",
    }),
  ).not.toThrow();
  expect(() => bindAiPaymentExecution(consent, "run-2")).toThrow("payment_quote_changed");
});
it("rejects changed request, source, actor and recurring cadence", () => {
  const quote = aiOwnPaymentQuote(input),
    accepted = { quoteToken: quote.payment.quoteToken };
  for (const changed of [
    { ...input, definition: { prompt: "changed" } },
    { ...input, actorId: "other" },
    {
      ...input,
      source: { ...source, connection: { ...source.connection, credentialsEncrypted: "other" } },
    },
    { ...input, scope: "recurring" as const },
  ])
    expect(() => aiOwnPaymentQuote(changed).accept(accepted, true)).toThrow(
      "payment_quote_changed",
    );
  const recurring = aiOwnPaymentQuote({
    ...input,
    scope: "recurring",
    definition: { cron: "0 7 * * *", timezone: "UTC" },
  });
  expect(() =>
    aiOwnPaymentQuote({
      ...input,
      scope: "recurring",
      definition: { cron: "0 8 * * *", timezone: "UTC" },
    }).accept({ quoteToken: recurring.payment.quoteToken }, true),
  ).toThrow("payment_quote_changed");
});
it("requires fresh acceptance and never offers hosted advisory execution", () => {
  expect(() => aiOwnPaymentQuote(input).accept(undefined, true)).toThrow("payment_quote_required");
  expect(() =>
    aiOwnPaymentQuote({
      ...input,
      source: { ...source, connection: { ...source.connection, credentialSource: "hosted" } },
    }),
  ).toThrow("payment_unavailable");
});
it("rechecks exact retained payer under the native business guard", async () => {
  const quote = aiOwnPaymentQuote(input),
    consent = quote.accept({ quoteToken: quote.payment.quoteToken });
  const guard = aiPaymentGuard(consent)!;
  const row = {
    ...source.connection,
    projectId: "project",
    project: { ownerId: "owner" },
    enabled: true,
    status: "connected",
  };
  const tx = {
    $queryRaw: vi.fn(),
    providerConnection: { findUnique: vi.fn(async () => row) },
  } as any;
  await guard.lockBusiness(tx, "attempt");
  await guard.assertRequest(tx, "attempt");
  row.provider = "changed-provider";
  await expect(guard.assertRequest(tx, "attempt")).rejects.toThrow("payment_quote_changed");
  row.provider = "future-ai";
  row.credentialsEncrypted = "changed";
  await expect(guard.assertRequest(tx, "attempt")).rejects.toThrow("payment_quote_changed");
});
it("reports exact actual evidence, unknown and free cache separately", () => {
  const quote = aiOwnPaymentQuote(input),
    consent = quote.accept({ quoteToken: quote.payment.quoteToken });
  expect(aiPaymentReceipt(consent, "0.012345", "confirmed")).toMatchObject({
    state: "settled",
    charge: { value: "0.012345", certainty: "measured" },
  });
  for (const state of ["unknown", "derived", "refund_pending"])
    expect(aiPaymentReceipt(consent, "4", state)).toMatchObject({
      state: "unknown",
      charge: { value: null, certainty: "unknown" },
    });
  expect(aiPaymentReceipt(consent, null, "pending")).toMatchObject({
    state: "pending",
    charge: { value: null },
  });
  expect(aiPaymentReceipt(consent, "0.012345", "confirmed", true)).toMatchObject({
    state: "free",
    charge: { value: "0", certainty: "free" },
  });
  expect(aiPaymentReceipt(undefined, "0", "confirmed")).toBeUndefined();
});
