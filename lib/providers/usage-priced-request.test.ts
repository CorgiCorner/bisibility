import { createMeter } from "@usagekit/meter";
import {
  createCatalog,
  dataforseo,
  dispatchPricedRequest,
  PricedRequest,
  type ProviderRequest,
} from "@usagekit/providers";
import { createMemoryStore } from "@usagekit/store";
import { expect, test, vi } from "vitest";
import { readObservedResponse } from "./usage";

const clock = { now: () => new Date("2026-10-11T12:00:00Z") };
const catalog = createCatalog({ providers: [dataforseo], enabled: ["dataforseo"], now: clock.now });
function fixture() {
  const meter = createMeter({ store: createMemoryStore({ clock, budgets: [] }), clock });
  return {
    meter,
    catalog,
    rejectUnknown: true,
    input: {
      operationId: crypto.randomUUID(),
      provider: "dataforseo",
      scope: { namespace: "test", principal: "owner", connection: "connection" },
      fundingSource: "byok" as const,
      costOwner: "owner",
      surface: "app" as const,
      source: "app" as const,
      estimate: [{ unit: "cents", value: 2n, scale: 0 }],
    },
  };
}

test("prepared transports cannot fall back to mutable input or admit a second time", async () => {
  const request: { method: string; url: string; body: [{ keyword: string; depth: number }] } = {
    method: "POST",
    url: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    body: [{ keyword: "before", depth: 100 }],
  };
  const f = fixture();
  const order: string[] = [];
  const prepare = vi.fn(
    async ({ request: snapshot }: { request: ProviderRequest; attemptKey: string }) => {
      await Promise.resolve();
      request.body[0].keyword = "after";
      order.push("prepare");
      const priced = await PricedRequest.price({ ...f, request: snapshot });
      return { attemptId: f.input.operationId, request: priced };
    },
  );
  const begin = vi.fn(),
    raw = vi.fn(),
    settle = vi.fn();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    order.push("dispatch");
    expect(JSON.parse(new TextDecoder().decode(init?.body as Uint8Array))[0].keyword).toBe(
      "before",
    );
    return Response.json({ value: 1 });
  });
  const reserve = vi.spyOn(f.meter, "reserve");
  await readObservedResponse({
    observer: {
      begin,
      prepare,
      settle,
      beforeDispatch: async () => {
        order.push("fence");
      },
    },
    providerRequest: request,
    request: raw,
    dispatch: (priced) =>
      dispatchPricedRequest(priced, fetcher, new AbortController().signal, null),
    measure: () => ({ cached: false, costCents: 2, quantity: 1, failed: false }),
  });
  expect(order).toEqual(["prepare", "fence", "dispatch"]);
  expect(reserve).toHaveBeenCalledTimes(1);
  expect(begin).not.toHaveBeenCalled();
  expect(raw).not.toHaveBeenCalled();
  expect(settle).toHaveBeenCalledWith(
    f.input.operationId,
    expect.objectContaining({ costCents: 2 }),
  );
});

test("missing snapshot dispatch fails before accounting and network side effects", async () => {
  const prepare = vi.fn(),
    begin = vi.fn(),
    request = vi.fn();
  await expect(
    readObservedResponse({
      observer: { begin, prepare, settle: vi.fn() },
      providerRequest: { method: "POST", url: "https://api.dataforseo.com" },
      request,
      measure: () => ({ cached: false, costCents: 0, quantity: 0, failed: false }),
    }),
  ).rejects.toMatchObject({ phase: "admission" });
  expect(prepare).not.toHaveBeenCalled();
  expect(begin).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
