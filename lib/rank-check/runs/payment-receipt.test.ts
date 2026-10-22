import { sealActionPaymentConsent } from "@/lib/action-payment/durable-consent";
import { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
import { rankItemPaymentReceipt, rankRunPaymentReceipt } from "./payment-receipt";

const mock = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/metering/usage-read", () => ({ readCanonicalUsage: mock.read }));
const option = {
  id: "option",
  connectionId: "conn_a00000000000000000000000",
  providerId: "serpapi",
  providerLabel: "SerpApi",
  fundingSource: "byok",
  payableUnit: {
    kind: "provider_native",
    providerId: "serpapi",
    key: "searches",
    singular: "search",
    plural: "searches",
  },
};
const run = {
  id: "run",
  publicId: "rcr_run",
  projectId: "project",
  status: "completed",
  selectionSpec: {
    rankPaymentConsent: sealActionPaymentConsent({
      version: 1,
      runPublicId: "rcr_run",
      projectId: "project",
      ownerId: "original-owner",
      actorId: "actor",
      source: "app",
      quoteId: "quote",
      option,
      route: "route",
      connectionId: "conn",
      connectionRevision: null,
      credentialFingerprint: "key",
      authority: "",
      targets: [{ keywordId: "kw", cost: 1, depth: 20, quantity: "2", amount: "2" }],
    }),
  },
};
beforeEach(() => {
  mock.read.mockResolvedValue([
    {
      provider: "serpapi",
      connectionId: "conn",
      credentialSource: "own",
      measurementStatus: "recorded",
      usageQuantity: new Prisma.Decimal(2),
      costCents: null,
      priceCents: null,
    },
  ]);
});
it("uses retained native units and original dispatch proofs, excluding separately paid extensions", async () => {
  const result = await rankItemPaymentReceipt(run, {
    checkId: "check",
    publicId: "check_public",
    status: "completed",
  });
  expect(result).toMatchObject({
    actionId: "check_public",
    option,
    state: "settled",
    charge: { value: "2", certainty: "measured" },
  });
  const query = mock.read.mock.calls[0][0];
  expect(query.text).toContain("measurement_native_dispatch_proofs");
  expect(query.text).not.toContain("measurement_snapshot_dispatch_proofs");
  expect(query.values).toContain("check");
});
it("never invents actual price for pending, legacy or unmeasured history", async () => {
  expect(await rankRunPaymentReceipt({ ...run, status: "running" })).toMatchObject({
    state: "pending",
    charge: { value: null },
  });
  mock.read.mockResolvedValue([]);
  expect(await rankRunPaymentReceipt(run)).toMatchObject({
    state: "unknown",
    charge: { value: null },
  });
  expect(await rankRunPaymentReceipt({ ...run, selectionSpec: {} })).toBeUndefined();
});
it("shows the actual customer debit on charged failures, independently of provider USD", async () => {
  const payload = JSON.parse(
    Buffer.from(run.selectionSpec.rankPaymentConsent.encoded, "base64url").toString(),
  );
  const credits = { kind: "credits", key: "credits", singular: "credit", plural: "credits" };
  payload.option = { ...payload.option, fundingSource: "platform", payableUnit: credits };
  mock.read.mockResolvedValue([
    {
      provider: "serpapi",
      connectionId: "conn",
      credentialSource: "hosted",
      measurementStatus: "recorded",
      failed: true,
      usageQuantity: new Prisma.Decimal(2),
      costCents: new Prisma.Decimal(1),
      priceCents: new Prisma.Decimal("1.3"),
    },
  ]);
  const charged = {
    ...run,
    selectionSpec: { rankPaymentConsent: sealActionPaymentConsent(payload) },
  };
  expect(
    await rankItemPaymentReceipt(charged, {
      checkId: "check",
      publicId: "check_public",
      status: "failed",
    }),
  ).toMatchObject({ state: "settled", charge: { value: "1.3", unit: credits } });
});
