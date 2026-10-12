import type { Prisma } from "@/lib/generated/prisma/client";
import type { Meter } from "@usagekit/core";
import { createMeter } from "@usagekit/meter";
import { dispatchPricedRequest } from "@usagekit/providers";
import { createMemoryStore } from "@usagekit/store";
import { beforeEach, expect, test, vi } from "vitest";
import { preparePaidAttempt } from "./current-paid-quote";
import type { PaidAttemptInput } from "./paid-attempt-types";
import { reserveOwnPricedRequest, reserveOwnPricedRequests } from "./priced-own-request";

const mocks = vi.hoisted(() => ({ policy: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/provider-rates/catalog-policy", async () => {
  const { createCatalog, dataforseo } = await import("@usagekit/providers");
  return {
    loadNativeCatalogPolicy: mocks.policy,
    nativeProviderCatalog: createCatalog({
      providers: [dataforseo],
      enabled: ["dataforseo"],
      now: () => new Date("2026-10-11T12:00:00Z"),
    }),
  };
});
vi.mock("./paid-admission", () => ({ reservePaidAttempts: mocks.reserve }));

const tx = {} as Prisma.TransactionClient;
let meter: Meter;
beforeEach(() => {
  const clock = { now: () => new Date("2026-10-11T12:00:00Z") };
  meter = createMeter({ store: createMemoryStore({ clock, budgets: [] }), clock });
  mocks.policy.mockReset().mockResolvedValue({ provider: "dataforseo", fundingSource: "byok" });
  mocks.reserve.mockReset().mockImplementation(async (_tx, inputs: PaidAttemptInput[]) => {
    return Promise.all(
      inputs.map(async (input) => {
        const result = await meter.reserve(preparePaidAttempt(input));
        if (result.outcome !== "reserved") throw new Error(JSON.stringify(result));
        return { operation: result.operation, replayed: result.replayed };
      }),
    );
  });
});
function fixture(
  body: [{ keyword: string; depth: number }] = [{ keyword: "keyword", depth: 100 }],
) {
  return {
    reservation: {
      operationId: crypto.randomUUID(),
      scope: {
        namespace: "test",
        principal: "owner",
        group: "project",
        connection: "connection",
        providerCredentialVersion: "version",
      },
      fundingSource: "byok" as const,
      costOwner: "owner",
      surface: "app" as const,
      source: "app" as const,
      provider: "dataforseo",
      operation: "rank_check",
      estimate: [{ unit: "cents", value: 0n, scale: 0 }],
    },
    context: {
      projectId: "project",
      connectionId: "connection",
      publicConnectionId: "public",
      providerCredentialVersion: "version",
      correlationId: "correlation",
      feature: "rank_check",
    },
    request: {
      method: "POST",
      url: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
      body,
      headers: { authorization: "Basic caller-secret" },
    },
  };
}

test("prices actual request depth and persists content-free proof through one admission", async () => {
  const f = fixture();
  const { priced } = await reserveOwnPricedRequest(tx, meter, f.reservation, f.context, f.request);
  expect(mocks.reserve).toHaveBeenCalledTimes(1);
  const paid: PaidAttemptInput = mocks.reserve.mock.calls[0]?.[1][0];
  expect(paid.reservation).toMatchObject({
    operation: "serp.google.organic.live.advanced",
    estimateSource: "list",
    estimate: expect.arrayContaining([{ unit: "cents", value: 2n, scale: 0 }]),
  });
  expect(paid.context).toMatchObject({
    feature: "rank_check",
    requestPricing: {
      version: 1,
      provider: "dataforseo",
      operation: "serp.google.organic.live.advanced",
      options: expect.objectContaining({ depth: "100" }),
    },
  });
  expect(JSON.stringify(paid.context)).not.toContain("keyword");
  expect(priced.headers).not.toHaveProperty("authorization");
});

test("dispatch keeps admitted bytes after mutation during asynchronous policy resolution", async () => {
  const f = fixture();
  mocks.policy.mockImplementation(async () => {
    f.request.body[0].depth = 1000;
    f.request.body[0].keyword = "site:mutated.test";
    return { provider: "dataforseo", fundingSource: "byok" };
  });
  const { priced } = await reserveOwnPricedRequest(tx, meter, f.reservation, f.context, f.request);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
  await dispatchPricedRequest(priced, fetcher, new AbortController().signal, {
    secret: "login:password",
  });
  const init = fetcher.mock.calls[0]?.[1];
  if (!init) throw new Error("Missing dispatch input");
  expect(JSON.parse(new TextDecoder().decode(init.body as Uint8Array))).toEqual([
    { keyword: "keyword", depth: 100 },
  ]);
  expect(new Headers(init.headers).get("authorization")).toBe("Basic bG9naW46cGFzc3dvcmQ=");
  expect(init.redirect).toBe("error");
});

test("unknown price-affecting fields cannot recover a cheap default or manual estimate", async () => {
  const f = fixture();
  Object.assign(f.request.body[0], { unreviewed_surcharge: true });
  await expect(
    reserveOwnPricedRequest(tx, meter, f.reservation, f.context, f.request),
  ).rejects.toThrow("pricing inputs are unknown");
  expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.policy).not.toHaveBeenCalled();
});

test("preserves genuine manual zero but applies catalog surcharge floors", async () => {
  mocks.policy.mockResolvedValue({
    provider: "dataforseo",
    fundingSource: "byok",
    manualPrices: { "serp.google.organic.live.advanced": { unit: "cents", value: 0n, scale: 0 } },
  });
  const plain = fixture();
  const zero = await reserveOwnPricedRequest(
    tx,
    meter,
    plain.reservation,
    plain.context,
    plain.request,
  );
  expect(zero.priced.estimate).toContainEqual({ unit: "cents", value: 0n, scale: 0 });
  const operator = fixture([{ keyword: "site:example.test", depth: 100 }]);
  const bounded = await reserveOwnPricedRequest(
    tx,
    meter,
    operator.reservation,
    operator.context,
    operator.request,
  );
  expect(bounded.priced.estimate.find((q) => q.unit === "cents")?.value).toBeGreaterThan(0n);
});

test("all batch children use one real admission with the original frozen requests", async () => {
  const second = fixture([{ keyword: "second", depth: 10 }]);
  const inputs = [fixture(), second];
  mocks.policy.mockImplementation(async () => {
    second.request.body[0].depth = 1000;
    return { provider: "dataforseo", fundingSource: "byok" };
  });
  const results = await reserveOwnPricedRequests(tx, meter, inputs);
  expect(results).toHaveLength(2);
  expect(mocks.reserve).toHaveBeenCalledTimes(1);
  const paid: PaidAttemptInput[] = mocks.reserve.mock.calls[0]?.[1];
  expect(paid.map((input) => input.context.requestPricing?.options.depth)).toEqual(["100", "10"]);
  expect(results[1]?.priced.parsed.body).toEqual([{ keyword: "second", depth: 10 }]);
});

test("an unknown batch child prevents admission of every child", async () => {
  const second = fixture();
  const inputs = [fixture(), second];
  Object.assign(second.request.body[0], { unknown_price: true });
  await expect(reserveOwnPricedRequests(tx, meter, inputs)).rejects.toThrow(
    "pricing inputs are unknown",
  );
  expect(mocks.reserve).not.toHaveBeenCalled();
});

test("a rejected shared admission rejects all snapshots without a provisional grant", async () => {
  mocks.reserve.mockRejectedValue(new Error("budget exceeded"));
  await expect(reserveOwnPricedRequests(tx, meter, [fixture(), fixture()])).rejects.toThrow(
    "budget exceeded",
  );
  expect(mocks.reserve).toHaveBeenCalledTimes(1);
});

test("fresh request pricing cannot exceed consent captured before admission", async () => {
  const input = Object.assign(fixture(), { maxCostCents: "1.9999" });
  await expect(reserveOwnPricedRequests(tx, meter, [input])).rejects.toMatchObject({
    name: "ProviderCostLimitError",
    estimatedCostCents: 2,
  });
  expect(mocks.reserve).not.toHaveBeenCalled();
});

test("one over-consent child prevents the whole priced batch from reserving", async () => {
  const inputs = [fixture(), Object.assign(fixture(), { maxCostCents: "0" })];
  await expect(reserveOwnPricedRequests(tx, meter, inputs)).rejects.toMatchObject({
    name: "ProviderCostLimitError",
  });
  expect(mocks.reserve).not.toHaveBeenCalled();
});

test("the accepted boundary is retained with the immutable request pricing proof", async () => {
  const input = Object.assign(fixture(), { maxCostCents: "2" });
  await reserveOwnPricedRequests(tx, meter, [input]);
  expect(mocks.reserve.mock.calls[0]?.[1][0].context.requestPricing).toMatchObject({
    maxCostCents: "2",
  });
});
