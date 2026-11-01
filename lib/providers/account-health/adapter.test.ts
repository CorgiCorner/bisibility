import { ProviderCallError } from "@/lib/providers/call-error";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AccountAdapter, capacityReadiness } from "./adapter";
import { dataForSeoAccountAdapter } from "./dataforseo";
import { accountHealthAdapter, accountHealthProviders } from "./registry";
import { serpApiAccountAdapter } from "./serpapi";

vi.mock("server-only", () => ({}));
const scope = { kind: "capability", capability: "rank_check" } as const;
const unsupported: AccountAdapter = {
  conditions: ["provider_transient"],
  probe: { available: false, cost: "unsupported", verifies: [], automaticRecheck: [] },
  capacity: { unit: null, minimum: () => null },
  classify: ({ scope: selected }) => ({ kind: "not_verified", scope: selected }),
  classifyError: (_error, selected) => ({ kind: "not_verified", scope: selected }),
};

it("resolves registered account adapters and rejects unknown provider identifiers", () => {
  expect(accountHealthProviders()).toEqual(["dataforseo", "serpapi"]);
  expect(accountHealthAdapter("dataforseo")).toBe(dataForSeoAccountAdapter);
  expect(accountHealthAdapter("serpapi")).toBe(serpApiAccountAdapter);
  expect(accountHealthAdapter("__proto__")).toBeUndefined();
});

describe.each([
  ["dataforseo", dataForSeoAccountAdapter],
  ["serpapi", serpApiAccountAdapter],
  ["unsupported", unsupported],
] as const)("%s account adapter contract", (_name, adapter) => {
  it("declares probe support and never polls rejected credentials", () => {
    expect(Boolean(adapter.check)).toBe(adapter.probe.available);
    expect(adapter.probe.automaticRecheck).not.toContain("provider_auth");
    if (!adapter.probe.available) expect(adapter.probe.cost).toBe("unsupported");
  });
  it("does not claim readiness without a known operation minimum", () => {
    expect(capacityReadiness(adapter.classify({ status: 200, body: {}, scope }), null)).toBe(
      "not_verified",
    );
  });
});

afterEach(() => vi.unstubAllGlobals());

it("preserves typed error codes and the scope of a capability restriction", () => {
  const error = new ProviderCallError("private response", null, "provider_account_restricted");
  expect(dataForSeoAccountAdapter.classifyError(error, scope)).toEqual({
    kind: "failure",
    code: "provider_account_restricted",
    scope,
  });
  expect(
    dataForSeoAccountAdapter.classify({ status: 200, body: { status_code: 40201 }, scope }),
  ).toEqual({
    kind: "failure",
    code: "provider_account_restricted",
    scope,
  });
  expect(
    dataForSeoAccountAdapter.classify({ status: 500, body: { status_code: 40104 }, scope }),
  ).toEqual({
    kind: "failure",
    code: "provider_transient",
    scope,
  });
});

it("requires the quoted monetary capacity and does not invent a minimum", () => {
  const fact = dataForSeoAccountAdapter.classify({
    status: 200,
    body: {
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ money: { balance: 0.001 } }] }],
    },
    scope,
  });
  expect(dataForSeoAccountAdapter.capacity.minimum({})).toBeNull();
  expect(
    capacityReadiness(fact, dataForSeoAccountAdapter.capacity.minimum({ estimatedCostUsd: 0.002 })),
  ).toBe("payment_required");
  expect(
    capacityReadiness(fact, dataForSeoAccountAdapter.capacity.minimum({ estimatedCostUsd: 0.001 })),
  ).toBe("ready");
});

it("uses search capacity and requires enough searches for the operation", () => {
  const fact = serpApiAccountAdapter.classify({
    status: 200,
    body: { total_searches_left: 1 },
    scope,
  });
  expect(capacityReadiness(fact, serpApiAccountAdapter.capacity.minimum({ searches: 2 }))).toBe(
    "payment_required",
  );
  expect(capacityReadiness(fact, serpApiAccountAdapter.capacity.minimum({}))).toBe("ready");
  expect(serpApiAccountAdapter.probe.cost).toBe("unverified");
  expect(serpApiAccountAdapter.probe.automaticRecheck).toEqual([]);
});

it("does not treat missing account capacity as zero or ready", () => {
  const missing = serpApiAccountAdapter.classify({ status: 200, body: {}, scope });
  expect(missing).toEqual({ kind: "not_verified", scope });
  expect(capacityReadiness(missing, 1)).toBe("not_verified");
  const missingBalance = dataForSeoAccountAdapter.classify({
    status: 200,
    body: { status_code: 20000, tasks: [] },
    scope,
  });
  expect(missingBalance).toEqual({ kind: "not_verified", scope });
  expect(capacityReadiness(missingBalance, 0.001)).toBe("not_verified");
});

it.each([200, 403, 429])("classifies exhausted searches at HTTP %s as billing", (status) => {
  expect(
    serpApiAccountAdapter.classify({
      status,
      body: { error: "You have run out of searches" },
      scope,
    }),
  ).toEqual({
    kind: "failure",
    code: "provider_billing",
    scope,
  });
});

it("recognizes rejected credentials without treating every forbidden response as authentication", () => {
  expect(
    serpApiAccountAdapter.classify({ status: 403, body: { error: "Invalid API key" }, scope }),
  ).toEqual({
    kind: "failure",
    code: "provider_auth",
    scope: { kind: "account" },
  });
  expect(serpApiAccountAdapter.classify({ status: 403, body: {}, scope })).toEqual({
    kind: "failure",
    code: "provider_transient",
    scope,
  });
});

it("keeps generic permission failures scoped and distinguishes known failures", () => {
  expect(dataForSeoAccountAdapter.classify({ status: 403, body: {}, scope })).toEqual({
    kind: "failure",
    code: "provider_transient",
    scope,
  });
  expect(
    dataForSeoAccountAdapter.classify({ status: 403, body: { status_code: 40104 }, scope }),
  ).toEqual({ kind: "failure", code: "provider_account_restricted", scope: { kind: "account" } });
  expect(
    dataForSeoAccountAdapter.classify({ status: 200, body: { status_code: 40200 }, scope }),
  ).toMatchObject({ code: "provider_billing" });
  expect(dataForSeoAccountAdapter.classify({ status: 401, body: {}, scope })).toMatchObject({
    code: "provider_auth",
  });
  expect(serpApiAccountAdapter.classify({ status: 429, body: {}, scope })).toMatchObject({
    code: "provider_rate_limited",
  });
  expect(serpApiAccountAdapter.classify({ status: 503, body: {}, scope })).toMatchObject({
    code: "provider_transient",
  });
});

it("never returns credentials from the probe on echoed errors or transport rejection", async () => {
  const key = "private key/with+symbols";
  const encoded = encodeURIComponent(key);
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: `api_key=${encoded} ${key}` }), { status: 403 }),
    )
    .mockRejectedValueOnce(new Error(`request failed api_key=${encoded} ${key}`));
  vi.stubGlobal("fetch", fetchMock);
  for (let i = 0; i < 2; i++) {
    const result = await serpApiAccountAdapter.check?.({ apiKey: key }, scope);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain(encoded);
    expect(result).toMatchObject({ kind: "failure", code: "provider_transient" });
  }
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("probes the account endpoints without paid searches", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: [{ status_code: 20000, result: [{ money: { balance: 1 } }] }],
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ total_searches_left: 2 })));
  vi.stubGlobal("fetch", fetchMock);
  expect(
    await dataForSeoAccountAdapter.check?.({ login: "user", password: "secret" }, scope),
  ).toMatchObject({ kind: "capacity", unit: "usd", value: 1 });
  expect(await serpApiAccountAdapter.check?.({ apiKey: "secret" }, scope)).toMatchObject({
    kind: "capacity",
    unit: "searches",
    value: 2,
  });
  expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.dataforseo.com/v3/appendix/user_data");
  expect(String(fetchMock.mock.calls[1]?.[0])).toMatch(/^https:\/\/serpapi\.com\/account\.json\?/);
});
