import { beforeEach, expect, it, vi } from "vitest";
import { prepareRankPayment } from "./payment";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), policy: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: { findUnique: mocks.owner } } }));
vi.mock("./payment-sources", () => ({
  rankPaymentOptions: () => [
    {
      id: "option",
      connectionId: "conn_a00000000000000000000000",
      providerId: "future",
      providerLabel: "Future",
      fundingSource: "platform",
      payableUnit: { kind: "credits", key: "credits", singular: "credit", plural: "credits" },
    },
  ],
}));
vi.mock("@/lib/providers/registry", () => ({
  getSerpProvider: () => ({
    payment: { basis: "provider_cost", unit: { kind: "currency", code: "USD" } },
  }),
}));
vi.mock("./payment-deployment", () => ({ quoteRankPayment: mocks.policy }));
vi.mock("@/lib/action-payment/availability", () => ({
  actionPaymentAvailability: async () => ({ availability: { allowed: true, reason: null } }),
}));
const input = {
  actorId: "actor",
  projectId: "project",
  source: "app",
  sourceHash: "source",
  selectionHash: "selection",
  connection: {
    id: "conn",
    provider: "future",
    credentialSource: "hosted",
    credentialsEncrypted: null,
    updatedAt: new Date("2026-10-21"),
  },
  targets: [{ keywordId: "kw", cost: 2, depth: 20 as const }],
};
beforeEach(() => {
  mocks.owner.mockResolvedValue({ ownerId: "owner" });
  mocks.policy.mockResolvedValue({ authority: "policy", prices: { kw: "4" } });
});
it("binds the exact customer price and captures durable authority only after signed acceptance", async () => {
  const quoted = (await prepareRankPayment(input))!;
  expect(quoted.quote.charge.value).toBe("4");
  expect(() => quoted.retain("rcr_run")).toThrow("payment_quote_required");
  const accepted = (await prepareRankPayment({
    ...input,
    acceptedPayment: { quoteToken: quoted.quote.quoteToken },
  }))!;
  expect(accepted.retain("rcr_run")).toMatchObject({ version: 1, signature: expect.any(String) });
});
it("keeps a thousand-target browser quote bounded and retains its entire accepted vector", async () => {
  const targets = Array.from({ length: 1000 }, (_, index) => ({
    keywordId: `kw_${index}`,
    cost: 2,
    depth: 20 as const,
  }));
  mocks.policy.mockResolvedValue({
    authority: "policy",
    prices: Object.fromEntries(targets.map((target) => [target.keywordId, "4"])),
  });
  const quote = (await prepareRankPayment({ ...input, targets }))!.quote;
  expect(quote.quoteToken.length).toBeLessThan(12000);
  expect(quote.charge.value).toBe("4000");
  const prepared = (await prepareRankPayment({
    ...input,
    targets: [...targets].reverse(),
    acceptedPayment: { quoteToken: quote.quoteToken },
  }))!;
  const retained = prepared.retain("rcr_large");
  expect(JSON.parse(Buffer.from(retained.encoded, "base64url").toString()).targets).toHaveLength(
    1000,
  );
});
it.each(["source", "owner", "policy", "scope"])(
  "requires a new quote after %s changes",
  async (kind) => {
    const quote = (await prepareRankPayment(input))!.quote;
    if (kind === "owner") mocks.owner.mockResolvedValue({ ownerId: "other" });
    if (kind === "policy")
      mocks.policy.mockResolvedValue({ authority: "changed", prices: { kw: "4" } });
    await expect(
      prepareRankPayment({
        ...input,
        ...(kind === "source"
          ? { connection: { ...input.connection, credentialSource: "own" } }
          : {}),
        ...(kind === "scope" ? { sourceHash: "changed" } : {}),
        acceptedPayment: { quoteToken: quote.quoteToken },
      }),
    ).rejects.toThrow("payment_quote_changed");
  },
);
