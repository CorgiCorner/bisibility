import { beforeEach, expect, it, vi } from "vitest";
import { prepareRankedKeywordPayment } from "./payment";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 7)] }));
vi.mock("@/lib/action-payment/availability", () => ({
  actionPaymentAvailability: async () => ({ availability: { allowed: true, reason: null } }),
}));
vi.mock("@/lib/provider-lookups/connection-estimate", () => ({
  requiredConnectionEstimate: async () => 2,
}));
vi.mock("./cache", () => ({ rankedKeywordsCacheTtlSeconds: () => 43200 }));

type Args = Parameters<typeof prepareRankedKeywordPayment>;
const project = { id: "project", ownerId: "owner", domain: "example.com" } as Args[1];
const selected = {
  connection: {
    id: "connection",
    publicId: "conn_a00000000000000000000000",
    provider: "dataforseo",
    credentialSource: "own",
    credentialsEncrypted: "fixture-key",
  },
  provider: {
    id: "dataforseo",
    label: "DataForSEO",
    payment: { basis: "provider_cost", unit: { kind: "currency", code: "USD" } },
  },
} as unknown as Args[2];
const input: Args[0] = { actorId: "actor", origin: { source: "app" }, limit: 100, offset: 0 };
beforeEach(() => {
  vi.useRealTimers();
});

it("quotes the selected key and page without making a provider call", async () => {
  const payment = await prepareRankedKeywordPayment(input, project, selected, "US");
  if (!payment) throw new Error("Expected payment quote");
  expect(payment?.quote).toMatchObject({
    option: { connectionId: selected.connection.publicId, fundingSource: "byok" },
    charge: { value: "0.02", unit: { kind: "currency", code: "USD" } },
  });
  expect(payment?.hasAttempted).toBe(false);
});

it("rejects a different page or key after the price was accepted", async () => {
  const payment = await prepareRankedKeywordPayment(input, project, selected, "US");
  if (!payment) throw new Error("Expected payment quote");
  const accepted = {
    ...input,
    requirePayment: true,
    acceptedPayment: { quoteToken: payment.quote.quoteToken },
  };
  await expect(
    prepareRankedKeywordPayment({ ...accepted, offset: 100 }, project, selected, "US"),
  ).rejects.toMatchObject({ reason: "payment_quote_changed" });
  await expect(
    prepareRankedKeywordPayment(
      accepted,
      project,
      { ...selected, connection: { ...selected.connection, credentialsEncrypted: "new-key" } },
      "US",
    ),
  ).rejects.toMatchObject({ reason: "payment_quote_changed" });
});

it("does not turn a cached-free quote into a paid fetch when the entry disappears", async () => {
  const cached = { costCents: 2, fetchedAt: new Date().toISOString(), rows: [], totalCount: 0 };
  const free = await prepareRankedKeywordPayment(input, project, selected, "US", cached);
  if (!free) throw new Error("Expected free quote");
  expect(free?.quote.charge.certainty).toBe("free");
  const accepted = await prepareRankedKeywordPayment(
    { ...input, requirePayment: true, acceptedPayment: { quoteToken: free.quote.quoteToken } },
    project,
    selected,
    "US",
  );
  expect(() => accepted?.child("ranked-page")).toThrow("payment_quote_changed");
});

it("requires a current quote for a new paid page", async () => {
  const payment = await prepareRankedKeywordPayment(
    { ...input, requirePayment: true },
    project,
    selected,
    "US",
  );
  expect(() => payment?.child("ranked-page")).toThrow("payment_quote_required");
});
