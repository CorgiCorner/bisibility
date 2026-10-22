import { preflightProviderBudget } from "@/lib/provider-lookups/paid-call-budget";
import type { SerpProvider } from "@/lib/providers/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessActionPayments } from "./batch";
import { enumerateActionPaymentOptions, selectActionPaymentCandidate } from "./options";
import { actionPaymentQuoteSchema } from "./schema";
import { prepareActionPayment } from "./session";

const mocks = vi.hoisted(() => ({
  quote: vi.fn(),
  availability: vi.fn(),
  assert: vi.fn(),
  read: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/provider-lookups/paid-call-budget", () => ({ preflightProviderBudget: vi.fn() }));
vi.mock("./current-route", () => ({
  currentPaymentRoute: async () => ({ id: "internal", provider: "future" }),
}));
vi.mock("@/lib/provider-usage/byok-evidence-storage", () => ({ loadByokEvidence: vi.fn() }));
vi.mock("./deployment-extension", () => ({
  quoteDeploymentPayment: mocks.quote,
  assertDeploymentPayment: mocks.assert,
  readDeploymentPayment: mocks.read,
  readDeploymentPaymentAvailability: mocks.availability,
}));
const provider = {
  id: "future",
  label: "Future",
  payment: { unit: { kind: "currency", code: "USD" }, basis: "provider_cost" },
  fetchRank: vi.fn(),
  testConnection: vi.fn(),
} as SerpProvider;
const connection = {
  id: "internal",
  publicId: "conn_a00000000000000000000000",
  provider: "future",
  credentialSource: "own" as const,
  credentialsEncrypted: "original",
};
const base = {
  projectId: "project",
  ownerId: "owner",
  actorId: "owner",
  source: "app",
  feature: "keyword_research",
  request: ["seed", "suggestions", 100],
  provider,
  connection,
  children: [{ key: "suggestion", costCents: 40, quantity: 100, cached: false }],
};
async function approved(input: Parameters<typeof prepareActionPayment>[0] = base) {
  const preview = (await prepareActionPayment(input))!;
  return prepareActionPayment({
    ...input,
    acceptedPayment: { quoteToken: preview.quote.quoteToken },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.quote.mockResolvedValue({ authority: "frozen-policy-account", amount: "40" });
  mocks.availability.mockImplementation(async ({ amount }) => ({
    availability: {
      allowed: Number(amount) <= 50,
      reason: Number(amount) <= 50 ? null : "insufficient_credits",
    },
  }));
  mocks.read.mockResolvedValue({ charge: "13.25", providerCostCents: "10.00" });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("server payable quote", () => {
  it("quotes currency in major USD and freezes one executable source", async () => {
    const session = (await prepareActionPayment(base))!;
    expect(session.quote.charge).toMatchObject({
      value: "0.4",
      unit: { kind: "currency", code: "USD" },
      certainty: "estimate",
    });
    expect(actionPaymentQuoteSchema.safeParse(session.quote).success).toBe(true);
    expect(session.options).toHaveLength(1);
  });
  it.each(["hosted", "own"] as const)("rejects accepted %s route switching", async (source) => {
    const initial = { ...base, connection: { ...connection, credentialSource: source } };
    const quote = (await prepareActionPayment(initial))!.quote;
    await expect(
      prepareActionPayment({
        ...initial,
        connection: { ...connection, credentialSource: source === "own" ? "hosted" : "own" },
        acceptedPayment: { quoteToken: quote.quoteToken },
      }),
    ).rejects.toThrow("payment_quote_changed");
  });
  it("rejects key, owner, actor and request changes", async () => {
    const quote = (await prepareActionPayment(base))!.quote;
    for (const changed of [
      { connection: { ...connection, credentialsEncrypted: "rotated" } },
      { ownerId: "other" },
      { actorId: "other" },
      { request: ["other seed"] },
    ]) {
      await expect(
        prepareActionPayment({
          ...base,
          ...changed,
          acceptedPayment: { quoteToken: quote.quoteToken },
        }),
      ).rejects.toThrow("payment_quote_changed");
    }
  });
  it("refuses expired consent", async () => {
    vi.useFakeTimers();
    const quote = (await prepareActionPayment(base))!.quote;
    vi.advanceTimersByTime(600001);
    await expect(
      prepareActionPayment({ ...base, acceptedPayment: { quoteToken: quote.quoteToken } }),
    ).rejects.toThrow("payment_quote_expired");
  });
  it("requires consent only before paid execution", async () => {
    const session = (await prepareActionPayment({ ...base, requirePayment: true }))!;
    expect(() => session.child("suggestion")).toThrow("payment_quote_required");
  });
  it("free consent never falls back to paid when cache disappears", async () => {
    const quote = (await prepareActionPayment({
      ...base,
      children: [{ ...base.children[0], cached: true }],
    }))!.quote;
    const session = (await prepareActionPayment({
      ...base,
      acceptedPayment: { quoteToken: quote.quoteToken },
    }))!;
    expect(() => session.child("suggestion")).toThrow("payment_quote_changed");
    expect(mocks.assert).not.toHaveBeenCalled();
  });
  it("paid consent can become a genuinely free cache hit", async () => {
    const quote = (await prepareActionPayment(base))!.quote;
    const session = (await prepareActionPayment({
      ...base,
      children: [{ ...base.children[0], cached: true }],
      acceptedPayment: { quoteToken: quote.quoteToken },
    }))!;
    expect(session.quote.charge).toMatchObject({ value: "0", certainty: "free" });
    expect(session.receipt()).toMatchObject({
      state: "free",
      charge: { value: "0", certainty: "free" },
    });
    expect(actionPaymentQuoteSchema.safeParse(session.quote).success).toBe(true);
  });
  it("charges only the remaining fresh part when accepted work becomes partly cached", async () => {
    const input = {
      ...base,
      connection: { ...connection, credentialSource: "hosted" as const },
      children: [base.children[0], { ...base.children[0], key: "related" }],
    };
    const quote = (await prepareActionPayment(input))!.quote;
    const session = (await prepareActionPayment({
      ...input,
      children: [
        { ...base.children[0], cached: true },
        { ...base.children[0], key: "related" },
      ],
      acceptedPayment: { quoteToken: quote.quoteToken },
    }))!;
    expect(session.quote.charge).toMatchObject({ value: "40", certainty: "estimate" });
    expect(session.quote.availability).toMatchObject({ allowed: true });
  });
  it("uses stable logical keys on accepted replay", async () => {
    const first = (await prepareActionPayment(base))!;
    const input = { ...base, acceptedPayment: { quoteToken: first.quote.quoteToken } };
    const a = (await prepareActionPayment(input))!.child("suggestion")!;
    const b = (await prepareActionPayment(input))!.child("suggestion")!;
    expect(a.operationKey).toBe(b.operationKey);
  });
  it("checks source and owner again under the actual admission transaction", async () => {
    const session = (await approved())!;
    const paid = session.child("suggestion")!;
    const tx = {
      providerConnection: {
        findUnique: vi.fn().mockResolvedValue({
          projectId: "project",
          provider: "future",
          credentialSource: "hosted",
          enabled: true,
          status: "connected",
          project: { ownerId: "owner" },
        }),
      },
    };
    await expect(paid.guard.assertRequest(tx as never, "attempt")).rejects.toThrow(
      "payment_quote_changed",
    );
  });
  it("returns actual hosted customer debit, not provider cost or current config", async () => {
    const session = (await approved({
      ...base,
      connection: { ...connection, credentialSource: "hosted" },
    }))!;
    await session.child("suggestion")!.record({ operationKey: "retained" });
    expect(session.receipt()).toMatchObject({
      state: "settled",
      charge: { value: "13.25", unit: { kind: "credits" }, certainty: "measured" },
    });
  });
  it("does not relabel USD evidence as another currency", async () => {
    await expect(
      prepareActionPayment({
        ...base,
        provider: {
          ...provider,
          payment: { unit: { kind: "currency", code: "JPY" }, basis: "provider_cost" },
        },
      }),
    ).rejects.toThrow("payment_unavailable");
  });
  it("native units are adapter supplied and never used as cents limits", async () => {
    const native = {
      ...provider,
      payment: {
        unit: {
          kind: "provider_native",
          providerId: "future",
          key: "queries",
          singular: "query",
          plural: "queries",
        },
        basis: "provider_quantity",
        estimateQuantity: () => "3",
      },
    } as SerpProvider;
    const input = { ...base, provider: native };
    const quote = (await prepareActionPayment(input))!.quote;
    const run = (await prepareActionPayment({
      ...input,
      acceptedPayment: { quoteToken: quote.quoteToken },
    }))!;
    expect(quote.charge).toMatchObject({ value: "3", unit: { key: "queries" } });
    expect(run.child("suggestion")!.costLimit).toBeUndefined();
  });
  it("enumerates all eligible real future routes with their own descriptors", async () => {
    const another = {
      ...provider,
      id: "other",
      payment: {
        unit: {
          kind: "provider_native",
          providerId: "other",
          key: "results",
          singular: "result",
          plural: "results",
        },
        basis: "provider_quantity",
        estimateQuantity: () => "1",
      },
    } as SerpProvider;
    const candidates = [
      { connection, provider },
      {
        connection: { ...connection, publicId: "conn_b00000000000000000000000" },
        provider: another,
      },
    ];
    const options = enumerateActionPaymentOptions(candidates);
    expect(options).toHaveLength(2);
    expect(options[1].payableUnit).toMatchObject({ key: "results" });
    expect(
      selectActionPaymentCandidate(candidates, options[1].connectionId, options[1].id)?.provider.id,
    ).toBe("other");
    expect(() =>
      selectActionPaymentCandidate(candidates, options[0].connectionId, options[1].id),
    ).toThrow("payment_quote_changed");
  });
  it("assesses two40-credit quotes against one50-credit wallet server-side", async () => {
    const hosted = { ...base, connection: { ...connection, credentialSource: "hosted" as const } };
    const a = (await prepareActionPayment(hosted))!.quote;
    const b = (await prepareActionPayment({ ...hosted, request: ["second seed"] }))!.quote;
    const result = await assessActionPayments({
      projectId: "project",
      actorId: "owner",
      quotes: [{ quoteToken: a.quoteToken }, { quoteToken: b.quoteToken }],
    });
    expect(result).toMatchObject({
      allowed: false,
      reason: "insufficient_credits",
      charges: [{ value: "80", unit: { kind: "credits" } }],
    });
  });
  it("refuses cross-account and duplicate-token batch assessments", async () => {
    const quote = (await prepareActionPayment(base))!.quote;
    await expect(
      assessActionPayments({
        projectId: "project",
        actorId: "other",
        quotes: [{ quoteToken: quote.quoteToken }],
      }),
    ).rejects.toThrow("payment_quote_changed");
    await expect(
      assessActionPayments({
        projectId: "project",
        actorId: "owner",
        quotes: [{ quoteToken: quote.quoteToken }, { quoteToken: quote.quoteToken }],
      }),
    ).rejects.toThrow("payment_quote_changed");
  });
});

it("resolves payment units per feature on the same future provider", async () => {
  const paymentFor = (feature: string) =>
    feature === "keyword_research"
      ? { basis: "provider_cost" as const, unit: { kind: "currency" as const, code: "USD" } }
      : {
          basis: "provider_quantity" as const,
          unit: {
            kind: "provider_native" as const,
            providerId: "future",
            key: feature === "keyword_metrics" ? "tokens" : "rows",
            singular: feature === "keyword_metrics" ? "token" : "row",
            plural: feature === "keyword_metrics" ? "tokens" : "rows",
          },
          estimateQuantity: () => "7",
        };
  const perFeature = { ...provider, payment: undefined, paymentFor };
  const research = (await prepareActionPayment({ ...base, provider: perFeature }))!;
  const metrics = (await prepareActionPayment({
    ...base,
    feature: "keyword_metrics",
    provider: perFeature,
  }))!;
  expect(research.quote.charge).toMatchObject({
    value: "0.4",
    unit: { kind: "currency", code: "USD" },
  });
  expect(metrics.quote.charge).toMatchObject({ value: "7", unit: { key: "tokens" } });
  expect(research.quote.option.id).not.toBe(metrics.quote.option.id);
  expect(
    enumerateActionPaymentOptions([{ connection, provider: perFeature }], "keyword_metrics")[0],
  ).toEqual(metrics.quote.option);
  await expect(
    prepareActionPayment({
      ...base,
      feature: "keyword_metrics",
      provider: perFeature,
      acceptedPayment: { quoteToken: research.quote.quoteToken },
    }),
  ).rejects.toThrow("payment_quote_changed");
});

it("keeps distinct native units separate when assessing one provider across features", async () => {
  const paymentFor = (feature: string) => ({
    basis: "provider_quantity" as const,
    unit: {
      kind: "provider_native" as const,
      providerId: "future",
      key: feature,
      singular: feature,
      plural: feature,
    },
    estimateQuantity: () => (feature === "keyword_research" ? "2" : "7"),
  });
  const perFeature = { ...provider, payment: undefined, paymentFor };
  const first = (await prepareActionPayment({ ...base, provider: perFeature }))!.quote;
  const second = (await prepareActionPayment({
    ...base,
    provider: perFeature,
    feature: "keyword_metrics",
  }))!.quote;
  vi.mocked(preflightProviderBudget).mockClear();
  const result = await assessActionPayments({
    projectId: "project",
    actorId: "owner",
    quotes: [{ quoteToken: first.quoteToken }, { quoteToken: second.quoteToken }],
  });
  expect(
    result.charges.map((amount) => [
      amount.unit.kind === "provider_native" ? amount.unit.key : "",
      amount.value,
    ]),
  ).toEqual([
    ["keyword_research", "2"],
    ["keyword_metrics", "7"],
  ]);
  expect(
    vi.mocked(preflightProviderBudget).mock.calls.map(([input]) => input.estimatedUsageQuantity),
  ).toEqual([2, 7]);
});

it("keeps the accepted hosted customer cap separate from legacy upstream USD cents", async () => {
  const input = {
    ...base,
    maxCostCents: 10,
    connection: { ...connection, credentialSource: "hosted" as const },
  };
  const quote = (await prepareActionPayment(input))!.quote;
  const execution = (await prepareActionPayment({
    ...input,
    acceptedPayment: { quoteToken: quote.quoteToken },
  }))!;
  expect(quote.charge).toMatchObject({ value: "40", unit: { kind: "credits" } });
  expect(execution.child("suggestion")?.costLimit?.remaining()).toBe("40");
});
