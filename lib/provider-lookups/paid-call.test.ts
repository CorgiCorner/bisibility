import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  correlationId: "00000000-0000-4000-8000-000000000000",
  ledger: [] as Array<{ costCents: number; failed: boolean }>,
  prisma: {
    $queryRaw: vi.fn(),
    project: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    providerCostEntry: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    rankCheck: { aggregate: vi.fn() },
  },
  resolveCredentials: vi.fn(),
  consumeLimit: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/provider-usage/tag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/provider-usage/tag")>();
  return {
    ...actual,
    createProviderRequestAttribution: (
      context: Parameters<typeof actual.createProviderRequestAttribution>[0],
    ) =>
      actual.createProviderRequestAttribution({ ...context, correlationId: mocks.correlationId }),
  };
});
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: mocks.resolveCredentials,
}));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: mocks.consumeLimit }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: vi.fn() }));

import { keywordMetricsRate, keywordResearchRate } from "@/lib/cost-estimate/provider-rates";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { dataForSeoProvider } from "@/lib/providers/serp/dataforseo";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo-errors";
import { monthlySpendCents } from "@/lib/rank-check/budget";
import { paidProviderCall, preflightProviderBudget, requiredEstimatedCostCents } from "./paid-call";

const location: SerpRankLocation = {
  gl: "us",
  hl: "en",
  primaryGeoCode: null,
  primaryGeoName: "United States",
  secondaryGeoName: "United States",
};

function runSuggestions(call = dataForSeoProvider.fetchKeywordSuggestions) {
  if (!call) throw new Error("Suggestions capability is unavailable.");
  return paidProviderCall({
    call: (credentials) =>
      call(credentials, {
        includeClickstream: false,
        limit: 100,
        location,
        seed: "rank tracker",
      }),
    connection: { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
    feature: "keyword_research",
    itemCount: 100,
    projectId: "project_1",
    provider: dataForSeoProvider,
    rate: keywordResearchRate("dataforseo", "suggestions"),
    source: "app",
    trigger: "manual",
  });
}

describe("paid provider lookup", () => {
  beforeEach(() => {
    mocks.correlationId = "00000000-0000-4000-8000-000000000000";
    mocks.ledger.length = 0;
    mocks.resolveCredentials.mockReturnValue({ login: "login", password: "secret" });
    mocks.consumeLimit.mockResolvedValue({ success: true });
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 5_000,
      providerAllocationsInitializedAt: null,
    });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: null, estimatedCostCents: null },
    });
    mocks.prisma.providerConnectionRate.findMany.mockResolvedValue([]);
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      allocationAmountPerMonth: 100,
      allocationUnit: "cents",
    });
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.providerCostEntry.count.mockResolvedValue(0);
    mocks.prisma.providerCostEntry.createMany.mockImplementation(
      async ({ data }: { data: Array<{ costCents: number; failed: boolean }> }) => {
        mocks.ledger.push({ costCents: Number(data[0].costCents), failed: data[0].failed });
        return { count: 1 };
      },
    );
    mocks.prisma.providerCostEntry.aggregate.mockImplementation(async () => ({
      _sum: { costCents: mocks.ledger.reduce((sum, entry) => sum + entry.costCents, 0) },
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("refuses a paid call estimate when no provider rate is configured", () => {
    expect(() =>
      requiredEstimatedCostCents({
        context: LIST_PROVIDER_RATE_CONTEXT,
        itemCount: 100,
        providerId: "unknown",
        rate: null,
      }),
    ).toThrow("No rate configured for provider unknown.");
  });

  describe.each(["backlinks", "domain overview"])("%s aggregate preflight", (_feature) => {
    const input = {
      connectionId: "connection_1",
      estimatedCostCents: 5,
      projectId: "project_1",
      provider: "dataforseo",
    };

    it("maps a legacy project cap overage to budget_exhausted", async () => {
      mocks.prisma.project.findUnique.mockResolvedValue({
        budgetCapCents: 10,
        providerAllocationsInitializedAt: null,
      });

      await expect(
        preflightProviderBudget({ ...input, estimatedCostCents: 11 }),
      ).rejects.toMatchObject({ outcome: { reason: "budget_exhausted" } });
      expect(mocks.prisma.providerConnection.findFirst).not.toHaveBeenCalled();
    });

    it("allows an initialized project over its legacy cap when its allocation has room", async () => {
      mocks.prisma.project.findUnique.mockResolvedValue({
        budgetCapCents: 1,
        providerAllocationsInitializedAt: new Date("2026-08-01T00:00:00.000Z"),
      });
      mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: { costCents: 20, usageQuantity: null },
      });

      await expect(preflightProviderBudget(input)).resolves.toBeUndefined();
      expect(mocks.prisma.rankCheck.aggregate).not.toHaveBeenCalled();
    });

    it("maps an exhausted initialized allocation to budget_exhausted", async () => {
      mocks.prisma.project.findUnique.mockResolvedValue({
        budgetCapCents: 10_000,
        providerAllocationsInitializedAt: new Date("2026-08-01T00:00:00.000Z"),
      });
      mocks.prisma.providerConnection.findFirst.mockResolvedValue({
        allocationAmountPerMonth: 10,
        allocationUnit: "cents",
      });
      mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _sum: { costCents: 8, usageQuantity: null },
      });

      await expect(preflightProviderBudget(input)).rejects.toMatchObject({
        outcome: { reason: "budget_exhausted" },
      });
    });
  });

  it("uses the aggregate request estimate for quota connection allocations", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 10_000,
      providerAllocationsInitializedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      allocationAmountPerMonth: 4,
      allocationUnit: "units",
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: { costCents: 50, usageQuantity: 2 },
    });

    await expect(
      preflightProviderBudget({
        connectionId: "connection_1",
        estimatedCostCents: 999,
        estimatedUsageQuantity: 3,
        projectId: "project_1",
        provider: "serpapi",
      }),
    ).rejects.toMatchObject({ outcome: { reason: "budget_exhausted" } });
  });

  it("ledgers charged validation failures and includes them in monthly spend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            cost: 0.01,
            status_code: 20000,
            tasks: [{ cost: 0.01, status_code: 40501, status_message: "Invalid Field: 'limit'" }],
          }),
          { headers: { "Content-Type": "application/json" }, status: 200 },
        ),
      ),
    );

    let validationError: unknown;
    try {
      await runSuggestions();
    } catch (error) {
      validationError = error;
    }
    expect(validationError).toBeInstanceOf(Error);
    expect((validationError as Error).message).toContain("Invalid Field: 'limit' Sent parameters:");
    expect((validationError as Error).message).toContain('"keyword":"rank tracker"');
    expect((validationError as Error).message).toContain('"limit":100');
    expect(mocks.prisma.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          cached: false,
          connectionId: "connection_1",
          costCents: 1,
          failed: true,
          feature: "keyword_research",
          projectId: "project_1",
          provider: "dataforseo",
          source: "app",
          trigger: "manual",
        }),
      ],
      skipDuplicates: true,
    });
    await expect(monthlySpendCents("project_1")).resolves.toBe(1);
  });

  it("passes complete attribution to the paid client and ledger", async () => {
    const call = vi.fn().mockResolvedValue({ costCents: 1 });

    await paidProviderCall({
      call,
      connection: { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
      feature: "keyword_metrics",
      itemCount: 1,
      projectId: "project_1",
      provider: dataForSeoProvider,
      rate: keywordMetricsRate("dataforseo"),
      source: "sdk",
      trigger: "manual",
    });

    expect(call).toHaveBeenCalledWith(
      { login: "login", password: "secret" },
      expect.objectContaining({
        context: expect.objectContaining({
          feature: "keyword_metrics",
          projectId: "project_1",
          source: "sdk",
          trigger: "manual",
        }),
        tag: expect.stringMatching(/;src=sdk;trg=manual;f=keyword_metrics;p=project_1;c=/),
      }),
    );
    expect(mocks.prisma.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ source: "sdk", trigger: "manual" })],
      skipDuplicates: true,
    });
  });

  it("rejects an adjacent over-boundary correlation before calling or recording cost", async () => {
    const shortestPrefix = "app=b;stage=dev;src=sdk;trg=manual;f=keyword_metrics;p=p;c=";
    const acceptedCorrelationId = "c".repeat(255 - Buffer.byteLength(shortestPrefix, "utf8"));
    mocks.correlationId = `${acceptedCorrelationId}c`;
    expect(Buffer.byteLength(`${shortestPrefix}${mocks.correlationId}`, "utf8")).toBe(256);
    const call = vi.fn().mockResolvedValue({ costCents: 1 });

    await expect(
      paidProviderCall({
        call,
        connection: {
          credentialsEncrypted: "encrypted",
          id: "connection_1",
          provider: "dataforseo",
        },
        feature: "keyword_metrics",
        itemCount: 1,
        projectId: "project_1",
        provider: dataForSeoProvider,
        rate: keywordMetricsRate("dataforseo"),
        source: "sdk",
        trigger: "manual",
      }),
    ).rejects.toThrow("correlationId is too long");
    expect(call).not.toHaveBeenCalled();
    expect(mocks.prisma.providerCostEntry.createMany).not.toHaveBeenCalled();
  });

  it("does not ledger transport errors", async () => {
    await expect(
      runSuggestions(async () => {
        throw new TypeError("network unavailable");
      }),
    ).rejects.toThrow("network unavailable");

    expect(mocks.prisma.providerCostEntry.createMany).not.toHaveBeenCalled();
  });

  it("propagates charged usage recorder storage failures", async () => {
    const storageFailure = new Error("ledger unavailable");
    mocks.prisma.providerCostEntry.createMany.mockRejectedValueOnce(storageFailure);

    await expect(
      runSuggestions(async () => {
        throw new DataForSeoUnsupportedLocationError("unsupported", 7);
      }),
    ).rejects.toBe(storageFailure);
  });

  it("preserves an auth outcome when charged usage recording fails", async () => {
    mocks.prisma.providerCostEntry.createMany.mockRejectedValueOnce(
      new Error("ledger unavailable"),
    );
    await expect(
      paidProviderCall({
        call: async () => {
          throw Object.assign(new ProviderAuthError("dataforseo", "Unauthorized"), {
            costCents: 7,
          });
        },
        connection: {
          credentialsEncrypted: "encrypted",
          id: "connection_1",
          provider: "dataforseo",
        },
        feature: "keyword_metrics",
        itemCount: 1,
        projectId: "project_1",
        provider: dataForSeoProvider,
        rate: keywordMetricsRate("dataforseo"),
        source: "app",
        trigger: "manual",
      }),
    ).rejects.toMatchObject({ outcome: { costCents: 7, reason: "needs_reauth" } });
  });

  it("preserves charged cost when mapping unsupported locations to a signal", async () => {
    mocks.prisma.providerCostEntry.createMany.mockReset();
    mocks.prisma.providerCostEntry.createMany.mockImplementation(
      async ({ data }: { data: Array<{ costCents: number; failed: boolean }> }) => {
        mocks.ledger.push({ costCents: Number(data[0].costCents), failed: data[0].failed });
        return { count: 1 };
      },
    );
    await expect(
      paidProviderCall({
        call: async () => {
          throw new DataForSeoUnsupportedLocationError("unsupported", 7);
        },
        connection: {
          credentialsEncrypted: "encrypted",
          id: "connection_1",
          provider: "dataforseo",
        },
        feature: "keyword_metrics",
        itemCount: 1,
        projectId: "project_1",
        provider: dataForSeoProvider,
        rate: keywordMetricsRate("dataforseo"),
        source: "app",
        trigger: "manual",
      }),
    ).rejects.toMatchObject({
      outcome: { costCents: 7, reason: "unsupported_location" },
    });
    expect(mocks.ledger).toEqual([{ costCents: 7, failed: true }]);
  });

  it.each([
    ["manual", { entries: [], manualAmountCents: 0.01 }],
    [
      "measured",
      {
        entries: Array.from({ length: 5 }, () => ({
          cached: false,
          costCents: 1.1,
          createdAt: new Date("2026-07-27T00:00:00.000Z"),
          failed: false,
          unitCostCents: 0.01,
        })),
        manualAmountCents: null,
      },
    ],
    ["list", LIST_PROVIDER_RATE_CONTEXT],
  ] as const)(
    "applies the same large-call budget gate to %s rates",
    async (_source, rateContext) => {
      const call = vi.fn().mockResolvedValue({ costCents: 11, rows: [] });
      mocks.prisma.project.findUnique.mockResolvedValue({
        budgetCapCents: 10.5,
        providerAllocationsInitializedAt: null,
      });

      await expect(
        paidProviderCall({
          call,
          connection: {
            credentialsEncrypted: "encrypted",
            id: "connection_1",
            provider: "dataforseo",
          },
          feature: "keyword_metrics",
          itemCount: 1_000,
          projectId: "project_1",
          provider: dataForSeoProvider,
          rate: keywordMetricsRate("dataforseo"),
          rateContext,
          source: "app",
          trigger: "manual",
        }),
      ).rejects.toMatchObject({ outcome: { reason: "budget_exhausted" } });
      expect(call).not.toHaveBeenCalled();
    },
  );
});
