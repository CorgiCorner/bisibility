import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRankedKeywords } from "./service";

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  paidCall: vi.fn(),
  prisma: {
    project: { findFirst: vi.fn() },
  },
  withCache: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.getProvider }));
vi.mock("@/lib/provider-lookups/paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-lookups/paid-call")>()),
  paidProviderCall: mocks.paidCall,
}));
vi.mock("@/lib/provider-rates/connection-context", () => ({
  loadProviderRateContext: vi.fn(async () => ({ entries: [], manualAmountCents: null })),
}));
vi.mock("./cache", () => ({
  rankedKeywordsCacheKey: () => "rk:key",
  withRankedKeywordsCache: mocks.withCache,
}));

const project = {
  budgetCapCents: 5_000,
  defaults: {
    locationKey: "US",
    locationRef: {
      canonicalKey: "US",
      countryCode: "US",
      gl: "us",
      hl: "en",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    },
  },
  domain: "www.example.com",
  id: "project_1",
  keywords: [],
  providerConnections: [
    {
      credentialsEncrypted: "encrypted",
      id: "connection_1",
      provider: "dataforseo",
      publicId: "conn_a00000000000000000000000",
    },
  ],
  publicId: "prj_1",
};

describe("ranked-keyword paid call origin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.getProvider.mockReturnValue({
      fetchRankedKeywords: vi.fn(),
      id: "dataforseo",
      label: "DataForSEO",
    });
    mocks.paidCall.mockResolvedValue({ costCents: 2, rows: [], totalCount: 5 });
    mocks.withCache.mockImplementation(async ({ load }: { load: () => Promise<unknown> }) => ({
      cached: false,
      status: "success",
      value: await load(),
    }));
  });

  it("passes the paying origin and manual trigger to the paid provider call", async () => {
    const origin = {
      credential: { id: "key_1", kind: "project_key" as const },
      source: "sdk" as const,
    };

    await expect(
      fetchRankedKeywords({ limit: 100, offset: 0, origin, projectId: "prj_1" }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.paidCall).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: { id: "key_1", kind: "project_key" },
        feature: "ranked_keywords",
        source: "sdk",
        trigger: "manual",
      }),
    );
  });
});
