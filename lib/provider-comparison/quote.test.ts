import { beforeEach, expect, it, vi } from "vitest";
import { comparisonFixture } from "./fixtures.test-support";

const mocks = vi.hoisted(() => ({ source: vi.fn(), context: vi.fn(), hostQuote: vi.fn() }));
vi.mock("./source", () => ({ loadComparisonSource: mocks.source }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContext: mocks.context,
}));
vi.mock("@/lib/providers/execution-extension", () => ({
  hostedRankCheckEstimatedCostCents: (provider: string) => (provider === "serpapi" ? 4 : null),
  quoteDeploymentRankReservations: mocks.hostQuote,
}));

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
      enabled: true,
      status: "connected",
      credentialSource: fundingSource,
      updatedAt: new Date(side.revision),
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
    /Both comparison providers/,
  );
});
