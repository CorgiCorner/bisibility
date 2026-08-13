import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ledger: [] as Array<{ costCents: number; failed: boolean }>,
  prisma: {
    $queryRaw: vi.fn(),
    project: { findUnique: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    providerCostEntry: { aggregate: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
  },
  resolveCredentials: vi.fn(),
  consumeLimit: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: mocks.resolveCredentials,
}));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: mocks.consumeLimit }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: vi.fn() }));

import { keywordMetricsRate, keywordResearchRate } from "@/lib/cost-estimate/provider-rates";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { dataForSeoProvider } from "@/lib/providers/serp/dataforseo";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo-errors";
import { monthlySpendCents } from "@/lib/rank-check/budget";
import { paidProviderCall, requiredEstimatedCostCents } from "./paid-call";

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
  });
}

describe("paid provider lookup", () => {
  beforeEach(() => {
    mocks.ledger.length = 0;
    mocks.resolveCredentials.mockReturnValue({ login: "login", password: "secret" });
    mocks.consumeLimit.mockResolvedValue({ success: true });
    mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 5_000 });
    mocks.prisma.rankCheck.aggregate.mockResolvedValue({
      _sum: { costCents: null, estimatedCostCents: null },
    });
    mocks.prisma.providerConnectionRate.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.providerCostEntry.create.mockImplementation(
      async ({ data }: { data: { costCents: number; failed: boolean } }) => {
        mocks.ledger.push({ costCents: Number(data.costCents), failed: data.failed });
        return { id: `cost_${mocks.ledger.length}` };
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
    expect(mocks.prisma.providerCostEntry.create).toHaveBeenCalledWith({
      data: {
        cached: false,
        connectionId: "connection_1",
        costCents: 1,
        failed: true,
        feature: "keyword_research",
        projectId: "project_1",
      },
    });
    await expect(monthlySpendCents("project_1")).resolves.toBe(1);
  });

  it("does not ledger transport errors", async () => {
    await expect(
      runSuggestions(async () => {
        throw new TypeError("network unavailable");
      }),
    ).rejects.toThrow("network unavailable");

    expect(mocks.prisma.providerCostEntry.create).not.toHaveBeenCalled();
  });

  it("preserves charged cost when mapping unsupported locations to a signal", async () => {
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
      mocks.prisma.project.findUnique.mockResolvedValue({ budgetCapCents: 10.5 });

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
        }),
      ).rejects.toMatchObject({ outcome: { reason: "budget_exhausted" } });
      expect(call).not.toHaveBeenCalled();
    },
  );
});
