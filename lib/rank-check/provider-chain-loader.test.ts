import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), contexts: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { providerConnection: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContexts: mocks.contexts,
  providerRateContextKey: (connection: string, feature: string) => `${connection}:${feature}`,
}));

import { loadSerpProviderChain } from "./provider-chain-loader";

beforeEach(() => vi.clearAllMocks());

test.each(["0", "1.2345", null])(
  "uses the canonical manual rate %s for paid rank checks",
  async (manualAmountCents) => {
    mocks.findMany.mockResolvedValue([
      { id: "connection", provider: "dataforseo", credentialSource: "own", costPerCheckCents: 99 },
    ]);
    mocks.contexts.mockResolvedValue(
      new Map([["connection:rank_check", { entries: [], manualAmountCents }]]),
    );
    const [connection] = await loadSerpProviderChain("project");
    expect(connection?.costPerCheckCents).toBe(manualAmountCents);
  },
);

test("never applies a stored manual provider rate to a hosted connection", async () => {
  mocks.findMany.mockResolvedValue([
    { id: "connection", provider: "dataforseo", credentialSource: "hosted" },
  ]);
  mocks.contexts.mockResolvedValue(
    new Map([["connection:rank_check", { entries: [], manualAmountCents: "5" }]]),
  );
  const [connection] = await loadSerpProviderChain("project");
  expect(connection?.costPerCheckCents).toBeNull();
  expect(connection?.rateContext?.manualAmountCents).toBeNull();
});
