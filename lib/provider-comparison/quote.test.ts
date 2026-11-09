import { beforeEach, expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";

const mocks = vi.hoisted(() => ({ source: vi.fn(), context: vi.fn(), hostQuote: vi.fn() }));
vi.mock("./source", () => ({ loadComparisonSource: mocks.source }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContext: mocks.context,
}));
vi.mock("@/lib/providers/execution-extension", () => ({
  deploymentRankUsesNativeUnits: async () => false,
  hostedRankCheckEstimatedCostCents: (provider: string) => (provider === "serpapi" ? 4 : null),
  quoteDeploymentRankReservations: mocks.hostQuote,
}));

import { quotePlaygroundComparison } from "./playground-quote";
import { quoteComparison } from "./quote";

function source(fundingSource: "own" | "hosted" = "own") {
  const snapshot = comparisonFixture(fundingSource);
  return {
    keyword: {
      id: "keyword",
      text: snapshot.text,
      device: snapshot.device,
      locationId: snapshot.locationId,
      locationRef: { displayName: "Poland" },
      project: { domain: "example.com" },
    },
    location: snapshot.location,
    connections: snapshot.connections.map((side) => ({
      ...side,
      projectId: "project",
      kind: "serp",
      providerUiRevision: 4n,
      enabled: true,
      status: "connected",
      credentialSource: fundingSource,
      updatedAt: new Date("2026-10-14T00:00:00.000Z"),
      credentialsEncrypted: "encrypted-fixture",
    })),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.mockResolvedValue(source());
  mocks.context.mockImplementation(async (id: string) => ({
    entries: [],
    manualAmountCents: null,
    nativeRankCosts: {
      provider: id.endsWith("serpapi") ? "serpapi" : "dataforseo",
      centsByDepth: { 20: 2 },
    },
  }));
  mocks.hostQuote.mockResolvedValue({ prices: { keyword: "6" } });
});
it("keeps native searches distinct from cents and blocks unknown estimates", async () => {
  const quoted = await quoteComparison("project", "keyword", new Date());
  expect(
    quoted.connections.map((side) => [side.quote.nativeUnit, side.quote.nativeQuantity]),
  ).toEqual([
    ["cents", 2],
    ["searches", 2],
  ]);
  mocks.context.mockResolvedValue({
    entries: [],
    manualAmountCents: null,
    nativeRankCosts: { provider: "dataforseo", centsByDepth: { 20: null } },
  });
  await expect(quoteComparison("project", "keyword", new Date())).rejects.toThrow(
    /quote is unavailable/,
  );
});
it("uses hosted customer-price authority with one DFS operation versus two SerpApi searches", async () => {
  mocks.source.mockResolvedValue(source("hosted"));
  const quoted = await quoteComparison("project", "keyword", new Date());
  expect(quoted.connections.map((side) => side.quote.estimatedCostCents)).toEqual([6, 6]);
  expect(mocks.hostQuote.mock.calls.map((call) => call[1].items[0].estimatedQuantity)).toEqual([
    "1",
    "2",
  ]);
  expect(mocks.context).not.toHaveBeenCalled();
});
it("one connected provider never silently selects a fallback or starts quoting the absent side", async () => {
  const one = source();
  one.connections = one.connections.filter((item) => item.provider === "dataforseo");
  mocks.source.mockResolvedValue(one);
  await expect(quoteComparison("project", "keyword", new Date())).rejects.toThrow(
    /Selected providers/,
  );
});

it("operational timestamps do not revoke a preview, while semantic configuration does", async () => {
  const initial = source();
  mocks.source.mockResolvedValue(initial);
  const before = await quoteComparison("project", "keyword", new Date());
  initial.connections[0].updatedAt = new Date("2026-10-15T01:00:00Z");
  const afterUsage = await quoteComparison("project", "keyword", new Date());
  expect(afterUsage).toEqual(before);
  Object.assign(initial.connections[0], { providerUiRevision: 5n });
  expect(await quoteComparison("project", "keyword", new Date())).not.toEqual(before);
});

it("quotes only selected playground providers without reading a tracked keyword", async () => {
  const sourceData = source("hosted");
  const project = { findUnique: vi.fn().mockResolvedValue({ domain: "example.com" }) };
  const location = {
    findUnique: vi
      .fn()
      .mockResolvedValue({ id: "location", displayName: "Poland", ...sourceData.location }),
  };
  const connection = { findMany: vi.fn().mockResolvedValue(sourceData.connections) };
  const db = {
    project,
    location,
    providerConnection: connection,
    keyword: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  mocks.hostQuote.mockResolvedValue({ prices: { "serp-playground": "6" } });
  const result = await quotePlaygroundComparison(
    "project",
    { query: "Coffee", locationId: "location", device: "mobile", providers: ["serpapi"] },
    new Date(),
    db as never,
  );
  expect(result).toMatchObject({ version: 2, keywordId: null, text: "Coffee", device: "mobile" });
  expect(result.connections.map((side) => side.provider)).toEqual(["serpapi"]);
  expect(mocks.source).not.toHaveBeenCalled();
  expect(mocks.hostQuote).toHaveBeenCalledTimes(1);
  expect(result.connections[0].customerEstimateCents).toBe(6);
});

it("prices the selected depth and permits explicitly chosen connected fallback without enabling it", async () => {
  const s = source("hosted");
  s.connections.forEach((c) => {
    c.enabled = false;
  });
  const db = {
    project: { findUnique: async () => ({ domain: "example.com" }) },
    location: {
      findUnique: async () => ({ id: "location", displayName: "Poland", ...s.location }),
    },
    providerConnection: { findMany: async () => s.connections },
    keyword: { findFirst: async () => null },
  };
  mocks.hostQuote.mockResolvedValue({ prices: { "serp-playground": "8" } });
  const result = await quotePlaygroundComparison(
    "project",
    {
      query: "Coffee",
      locationId: "location",
      device: "desktop",
      providers: ["serpapi"],
      depth: 100,
    },
    new Date(),
    db as never,
  );
  expect(result.depth).toBe(100);
  expect(result.connections[0].quote.nativeQuantity).toBe(10);
  expect(mocks.hostQuote).toHaveBeenCalledWith(
    db,
    expect.objectContaining({ items: [expect.objectContaining({ estimatedQuantity: "10" })] }),
  );
  expect(s.connections.every((c) => !c.enabled)).toBe(true);
});
