import { sealActionPaymentConsent } from "@/lib/action-payment/durable-consent";
import { actionPaymentOption } from "@/lib/action-payment/options";
import { paymentFingerprint } from "@/lib/action-payment/token";
import { serpApiProvider } from "@/lib/providers/serp/serpapi";
import { beforeEach, expect, it, vi } from "vitest";
import { assertRankPaymentForCheck, rankPaymentExecution } from "./payment-runtime";

const mocks = vi.hoisted(() => ({ query: vi.fn(), connection: vi.fn(), policy: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: mocks.query, providerConnection: { findUnique: mocks.connection } },
}));
vi.mock("./payment-deployment", () => ({ quoteRankPayment: mocks.policy }));
const unit = { kind: "credits", key: "credits", singular: "credit", plural: "credits" } as const;
const consent = {
  version: 1,
  runPublicId: "rcr_a",
  projectId: "project",
  ownerId: "owner",
  actorId: "actor",
  source: "app",
  quoteId: "quote",
  option: {
    id: actionPaymentOption(
      {
        connection: { publicId: "conn_a00000000000000000000000", credentialSource: "hosted" },
        provider: serpApiProvider,
      },
      "rank_check",
    )!.id,
    connectionId: "conn_a00000000000000000000000",
    providerId: "serpapi",
    providerLabel: "SerpApi",
    fundingSource: "platform",
    payableUnit: unit,
  },
  route: "route",
  connectionId: "conn",
  connectionRevision: "2026-10-21T00:00:00.000Z",
  credentialFingerprint: paymentFingerprint(null),
  authority: "authority",
  targets: [{ keywordId: "kw", cost: 2, depth: 20, quantity: "2", amount: "4" }],
};
const row = {
  projectId: "project",
  ownerId: "owner",
  publicId: "rcr_a",
  keywordId: "kw",
  depth: 20,
  spec: { rankPaymentConsent: sealActionPaymentConsent(consent) },
};
const current = {
  id: "conn",
  projectId: "project",
  publicId: consent.option.connectionId,
  provider: "serpapi",
  credentialSource: "hosted",
  credentialsEncrypted: null,
  updatedAt: new Date(consent.connectionRevision),
  enabled: true,
  status: "connected",
};
const tx = {
  $queryRaw: mocks.query,
  providerConnection: { findUnique: mocks.connection },
} as never;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue([row]);
  mocks.connection.mockResolvedValue(current);
  mocks.policy.mockResolvedValue({ authority: "authority", prices: { kw: "4" } });
});
it("pins an accepted queued run to its exact payer rather than a fallback", async () => {
  const result = await rankPaymentExecution(
    "check",
    [
      { id: "other", provider: "dataforseo" },
      { id: "conn", provider: "serpapi", credentialSource: "hosted" },
    ],
    "project",
  );
  expect(result.connections).toHaveLength(1);
  expect(result.connections[0].id).toBe("conn");
  expect(result.payment?.costLimit?.remaining()).toBe("4");
  await expect(result.payment?.guard.assertRequest(tx, "native-op")).resolves.toBeUndefined();
});
it.each(["source", "key", "owner", "policy", "price"])(
  "refuses changed %s before native reserve",
  async (kind) => {
    if (kind === "source")
      mocks.connection.mockResolvedValue({ ...current, credentialSource: "own" });
    if (kind === "key")
      mocks.connection.mockResolvedValue({ ...current, credentialsEncrypted: "changed" });
    if (kind === "owner") mocks.query.mockResolvedValue([{ ...row, ownerId: "other" }]);
    if (kind === "policy")
      mocks.policy.mockResolvedValue({ authority: "changed", prices: { kw: "4" } });
    await expect(
      assertRankPaymentForCheck(tx, "check", "conn", kind === "price" ? "5" : "4"),
    ).rejects.toThrow("payment_quote_changed");
  },
);
it("does not invent consent for a legacy run", async () => {
  mocks.query.mockResolvedValue([{ ...row, spec: {} }]);
  const chain = [
    { id: "conn", provider: "serpapi" },
    { id: "other", provider: "dataforseo" },
  ];
  expect(await rankPaymentExecution("check", chain, "project")).toEqual({
    connections: chain,
    payment: undefined,
  });
});
