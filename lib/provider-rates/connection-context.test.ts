import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadProviderRateContext,
  loadProviderRateContexts,
  MAX_PROVIDER_RATE_SAMPLES,
  providerRateContextKey,
} from "./connection-context";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    providerConnectionRate: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("provider rate context loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.providerConnectionRate.findMany.mockResolvedValue([]);
  });

  it("bounds each connection-feature history with a SQL window", async () => {
    await loadProviderRateContext(
      "connection_1",
      "keyword_metrics",
      new Date("2026-07-27T00:00:00.000Z"),
    );

    const query = mocks.prisma.$queryRaw.mock.calls[0]?.[0] as { sql?: string; values?: unknown[] };
    expect(query.sql).toContain("ROW_NUMBER() OVER");
    expect(query.sql).toContain('"sampleRank" <=');
    expect(query.values).toContain(MAX_PROVIDER_RATE_SAMPLES);
  });

  it("uses two batched reads for a whole provider chain", async () => {
    const connectionIds = ["connection_1", "connection_2", "connection_3", "connection_4"];

    const contexts = await loadProviderRateContexts(connectionIds, ["rank_check"]);

    expect(mocks.prisma.providerConnectionRate.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    for (const connectionId of connectionIds) {
      expect(contexts.get(providerRateContextKey(connectionId, "rank_check"))).toEqual({
        entries: [],
        manualAmountCents: null,
      });
    }
  });
});
