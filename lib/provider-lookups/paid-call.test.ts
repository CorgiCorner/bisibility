import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { byokTestEvidence } from "@/lib/provider-usage/byok-test-evidence";
import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertOperationAccess: vi.fn(),
  correlationId: "00000000-0000-4000-8000-000000000000",
  entries: [] as Array<Record<string, unknown>>,
  ledger: [] as Array<{ costCents: number; failed: boolean }>,
  prisma: {
    meteringUsageEvidence: undefined as unknown as ReturnType<
      typeof byokTestEvidence
    >["meteringUsageEvidence"],
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    project: { findUnique: vi.fn() },
    providerConnection: { findFirst: vi.fn(), findUnique: vi.fn() },
    providerConnectionRate: { findMany: vi.fn() },
    providerCostEntry: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    rankCheck: { aggregate: vi.fn() },
  },
  resolveCredentials: vi.fn(),
  consumeLimit: vi.fn(),
  startExecution: vi.fn(),
  markReauth: vi.fn(),
}));

// Where-clause matcher for the fake provider cost entry table.
function entryMatches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") {
      return (value as Array<Record<string, unknown>>).some((clause) => entryMatches(row, clause));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("notIn" in value) return !(value as { notIn: unknown[] }).notIn.includes(row[key]);
      if ("in" in value) return (value as { in: unknown[] }).in.includes(row[key]);
      if ("not" in value) return row[key] !== (value as { not: unknown }).not;
    }
    if (value === null) return row[key] == null;
    return row[key] === value;
  });
}

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/operations/access-extension", () => ({
  assertOperationAccess: mocks.assertOperationAccess,
}));
vi.mock("@/lib/provider-usage/tag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/provider-usage/tag")>();
  return {
    ...actual,
    createProviderRequestAttribution: (
      ...args: Parameters<typeof actual.createProviderRequestAttribution>
    ) =>
      actual.createProviderRequestAttribution(
        { ...args[0], correlationId: mocks.correlationId },
        args[1],
      ),
  };
});
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: mocks.resolveCredentials,
}));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: mocks.consumeLimit }));
vi.mock("@/lib/providers/auth-state", () => ({ markProviderNeedsReauth: mocks.markReauth }));
vi.mock("@/lib/providers/execution-extension", () => ({
  startDeploymentExecution: mocks.startExecution,
}));
vi.mock("@/lib/providers/execution-authority", () => ({
  readDeploymentMeteringPreflightAuthority: async () => "legacy",
}));

import {
  backlinksRates,
  keywordMetricsRate,
  keywordResearchRate,
} from "@/lib/cost-estimate/provider-rates";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCallError } from "@/lib/providers/call-error";
import { dataForSeoProvider } from "@/lib/providers/serp/dataforseo";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo-errors";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { monthlySpendCents } from "@/lib/rank-check/budget";
import { paidProviderCall, preflightProviderBudget, requiredEstimatedCostCents } from "./paid-call";
import { deploymentEstimate } from "./paid-call-deployment";

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
  it("accepts representational float noise from the actual provider rate estimator", () => {
    for (const itemCount of [28, 53, 57, 72, 78, 97]) {
      const estimate = requiredEstimatedCostCents({
        context: { entries: [], manualAmountCents: null },
        itemCount,
        providerId: "dataforseo",
        rate: backlinksRates("dataforseo").rows,
      });
      expect(Number(deploymentEstimate(estimate, 4))).toBe(
        Number((2.4 + itemCount * 0.0036).toFixed(4)),
      );
    }
    expect(() => deploymentEstimate(2.28001, 4)).toThrow(RangeError);
  });
  it("rejects estimates that cannot be admitted as exact decimals", () => {
    for (const value of [0, -1, NaN, Infinity, 0.00001, 1e-7, 1e12]) {
      expect(() => deploymentEstimate(value, 4)).toThrow(RangeError);
    }
    expect(deploymentEstimate(0.0625, 4)).toBe("0.0625");
    expect(deploymentEstimate(3, 6)).toBe("3");
    expect(deploymentEstimate(99999999.9999, 4)).toBe("99999999.9999");
    expect(() => deploymentEstimate(100000000, 4)).toThrow(RangeError);
    expect(deploymentEstimate(999999999999, 6)).toBe("999999999999");
    expect(() => deploymentEstimate(1000000000000, 6)).toThrow(RangeError);
  });
  beforeEach(() => {
    mocks.prisma.meteringUsageEvidence = byokTestEvidence("dataforseo").meteringUsageEvidence;
    mocks.correlationId = "00000000-0000-4000-8000-000000000000";
    mocks.ledger.length = 0;
    mocks.entries.length = 0;
    mocks.resolveCredentials.mockReturnValue({ login: "login", password: "secret" });
    mocks.consumeLimit.mockResolvedValue({ success: true });
    mocks.startExecution.mockResolvedValue(null);
    mocks.prisma.project.findUnique.mockResolvedValue({
      ownerId: "owner_1",
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
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "own",
      projectId: "project_1",
      provider: "dataforseo",
    });
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.providerCostEntry.count.mockResolvedValue(0);
    // Persistent fake ledger: journal begin/settle SQL shapes run against it.
    mocks.prisma.providerCostEntry.findFirst.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) =>
        mocks.entries.find((row) => entryMatches(row, where)) ?? null,
    );
    mocks.prisma.providerCostEntry.createMany.mockImplementation(
      async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const entry of data) {
          mocks.entries.push({ ...entry });
          mocks.ledger.push({
            costCents: Number(entry.costCents),
            failed: Boolean(entry.failed),
          });
        }
        return { count: data.length };
      },
    );
    mocks.prisma.providerCostEntry.update.mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = mocks.entries.find((entry) => entry.id === where.id);
        if (!row) throw Object.assign(new Error("Record not found."), { code: "P2025" });
        Object.assign(row, data);
        return row;
      },
    );
    mocks.prisma.providerCostEntry.deleteMany.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        const victims = mocks.entries.filter((row) => entryMatches(row, where));
        for (const victim of victims) {
          mocks.entries.splice(mocks.entries.indexOf(victim), 1);
        }
        return { count: victims.length };
      },
    );
    mocks.prisma.providerCostEntry.updateMany.mockImplementation(async (args) => {
      await mocks.prisma.providerCostEntry.update(args);
      return { count: 1 };
    });
    mocks.prisma.$transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run(mocks.prisma),
    );
    mocks.prisma.providerCostEntry.aggregate.mockImplementation(async () => ({
      _count: { _all: mocks.entries.length },
      _sum: {
        costCents: mocks.entries.reduce((sum, entry) => sum + Number(entry.costCents ?? 0), 0),
        usageQuantity: null,
      },
    }));
    mocks.prisma.providerCostEntry.groupBy.mockImplementation(async (args: unknown) => {
      const aggregate = await mocks.prisma.providerCostEntry.aggregate(args);
      return [{ credentialSource: "own", _count: aggregate._count, _sum: aggregate._sum }];
    });
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
      surface: "app" as const,
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
        outcome: { provider: "dataforseo", reason: "budget_exhausted" },
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
        surface: "app",
      }),
    ).rejects.toMatchObject({ outcome: { reason: "budget_exhausted" } });
  });

  it("enforces an sdk-sourced call against the programmatic surface", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 10_000,
      providerAllocationsInitializedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      allocationAmountPerMonth: 1000,
      allocationUnit: "cents",
      programmaticAllocationAmountPerMonth: 1000,
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { costCents: 0, usageQuantity: null },
    });
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

    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: { in: ["api", "sdk", "cli", "mcp"] } }),
      }),
    );
  });

  it("enforces an app-sourced call against the app surface with legacy rows", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 10_000,
      providerAllocationsInitializedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      allocationAmountPerMonth: 1000,
      allocationUnit: "cents",
      programmaticAllocationAmountPerMonth: 1000,
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { costCents: 0, usageQuantity: null },
    });
    const call = vi.fn().mockResolvedValue({ costCents: 1 });

    await paidProviderCall({
      call,
      connection: { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
      feature: "keyword_metrics",
      itemCount: 1,
      projectId: "project_1",
      provider: dataForSeoProvider,
      rate: keywordMetricsRate("dataforseo"),
      source: "app",
      trigger: "manual",
    });

    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ source: { in: ["app", "worker"] } }, { source: null }],
        }),
      }),
    );
  });

  it("carries the exhausted surface on the budget failure outcome", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: 10_000,
      providerAllocationsInitializedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      allocationAmountPerMonth: 1000,
      allocationUnit: "cents",
      programmaticAllocationAmountPerMonth: 8,
    });
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({
      _count: { _all: 8 },
      _sum: { costCents: 8, usageQuantity: null },
    });
    const call = vi.fn();

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
        source: "cli",
        trigger: "manual",
      }),
    ).rejects.toMatchObject({
      outcome: { provider: "dataforseo", reason: "budget_exhausted", surface: "programmatic" },
    });
    expect(call).not.toHaveBeenCalled();
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
    // The journal settles the charged failure onto the durable row it opened.
    expect(mocks.prisma.providerCostEntry.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cached: false,
        costCents: 1,
        failed: true,
        measurementStatus: "recorded",
        usageQuantity: 1,
      }),
      where: expect.objectContaining({ id: expect.any(String) }),
    });
    expect(mocks.entries).toEqual([
      expect.objectContaining({
        connectionId: "connection_1",
        costCents: 1,
        failed: true,
        feature: "keyword_research",
        measurementStatus: "recorded",
        projectId: "project_1",
        provider: "dataforseo",
        source: "app",
        trigger: "manual",
        usageQuantity: 1,
      }),
    ]);
    await expect(monthlySpendCents("project_1")).resolves.toBe(1);
  });

  it("returns all confirmed request charges rather than the last adapter estimate", async () => {
    const result = await paidProviderCall({
      call: async (credentials) => {
        const observer = credentials.usageObserver;
        if (!observer) throw new Error("Missing durable request accounting");
        await observer.settle(await observer.begin(), {
          cached: false,
          failed: true,
          costCents: 0.25,
          quantity: 1,
          providerRequestId: "charged-retry",
        });
        await observer.settle(await observer.begin(), {
          cached: false,
          failed: false,
          costCents: 1,
          quantity: 1,
          providerRequestId: "success",
        });
        return { costCents: 1 };
      },
      connection: { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
      feature: "keyword_metrics",
      itemCount: 1,
      projectId: "project_1",
      provider: dataForSeoProvider,
      rate: keywordMetricsRate("dataforseo"),
      source: "app",
      trigger: "manual",
    });
    expect(result.costCents).toBe(1.25);
    expect(mocks.entries).toHaveLength(2);
    await expect(monthlySpendCents("project_1")).resolves.toBe(1.25);
  });

  it("makes no HTTP request when the journal cannot persist its begin row", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.prisma.providerCostEntry.createMany.mockRejectedValueOnce(
      new Error("ledger unavailable"),
    );

    await expect(runSuggestions()).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.entries).toEqual([]);
  });

  it("does not issue another paid request when settlement fails and keeps the unknown row", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cost: 0.01,
          status_code: 50000,
          status_message: "Internal error",
          tasks: [{ cost: 0.01, status_code: 50000, status_message: "Internal error" }],
        }),
        { headers: { "Content-Type": "application/json" }, status: 500 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.prisma.providerCostEntry.update.mockRejectedValue(new Error("ledger unavailable"));

    await expect(runSuggestions()).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    // The retryable HTTP 500 must not be retried once accounting has failed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.entries).toEqual([
      expect.objectContaining({ costCents: 0, measurementStatus: "unknown" }),
    ]);
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
      expect.objectContaining({
        login: "login",
        password: "secret",
        usageObserver: expect.objectContaining({
          begin: expect.any(Function),
          settle: expect.any(Function),
        }),
      }),
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

  it("passes the credential through the attribution to the ledger on success and charged failure", async () => {
    const credential = { id: "key_1", kind: "project_key" as const };
    const call = vi.fn().mockResolvedValue({ costCents: 1 });

    await paidProviderCall({
      call,
      connection: { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
      credential,
      feature: "keyword_metrics",
      itemCount: 1,
      projectId: "project_1",
      provider: dataForSeoProvider,
      rate: keywordMetricsRate("dataforseo"),
      source: "sdk",
      trigger: "manual",
    });

    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({
        login: "login",
        password: "secret",
        usageObserver: expect.objectContaining({
          begin: expect.any(Function),
          settle: expect.any(Function),
        }),
      }),
      expect.objectContaining({ credential: { id: "key_1", kind: "project_key" } }),
    );
    expect(mocks.prisma.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ credentialId: "key_1", credentialKind: "project_key" })],
      skipDuplicates: true,
    });

    mocks.prisma.providerCostEntry.createMany.mockClear();
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
        credential,
        feature: "keyword_metrics",
        itemCount: 1,
        projectId: "project_1",
        provider: dataForSeoProvider,
        rate: keywordMetricsRate("dataforseo"),
        source: "sdk",
        trigger: "manual",
      }),
    ).rejects.toMatchObject({ outcome: { costCents: 7, reason: "unsupported_location" } });
    expect(mocks.prisma.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          costCents: 7,
          credentialId: "key_1",
          credentialKind: "project_key",
          failed: true,
        }),
      ],
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

  it("denies a new paid provider request before any provider work when the access gate refuses", async () => {
    mocks.assertOperationAccess.mockRejectedValueOnce(new OperationAccessDeniedError());
    const call = vi.fn();

    await expect(runSuggestions(call)).rejects.toThrow(new OperationAccessDeniedError());

    expect(mocks.assertOperationAccess).toHaveBeenCalledWith("project_1");
    expect(mocks.resolveCredentials).not.toHaveBeenCalled();
    expect(mocks.consumeLimit).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(mocks.ledger).toEqual([]);
  });

  it("admits the paid provider call when the access gate allows the project", async () => {
    mocks.assertOperationAccess.mockResolvedValueOnce(undefined);

    await runSuggestions(vi.fn().mockResolvedValue({ costCents: 20 }));

    expect(mocks.assertOperationAccess).toHaveBeenCalledWith("project_1");
    expect(mocks.ledger).toEqual([{ costCents: 20, failed: false }]);
  });

  it("fails closed when a hosted connection has no deployment execution", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "hosted",
      projectId: "project_1",
      provider: "dataforseo",
    });
    const call = vi.fn();
    await expect(runSuggestions(call)).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(call).not.toHaveBeenCalled();
    expect(mocks.resolveCredentials).not.toHaveBeenCalled();
    expect(mocks.prisma.providerCostEntry.createMany).not.toHaveBeenCalled();
    expect(mocks.startExecution).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale own-key caller rate when estimating deployment execution", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "hosted",
      projectId: "project_1",
      provider: "dataforseo",
    });
    const call = vi.fn();
    await expect(
      paidProviderCall({
        call,
        connection: {
          credentialsEncrypted: "encrypted",
          id: "connection_1",
          provider: "dataforseo",
        },
        feature: "keyword_research",
        itemCount: 100,
        projectId: "project_1",
        provider: dataForSeoProvider,
        rate: keywordResearchRate("dataforseo", "suggestions"),
        rateContext: { entries: [], manualAmountCents: 0.0001 },
        source: "app",
        trigger: "manual",
      }),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(mocks.startExecution).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCostCents: "2.4" }),
    );
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects provider mismatch before credentials or deployment admission", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "hosted",
      projectId: "project_1",
      provider: "serpapi",
    });
    const call = vi.fn();
    await expect(runSuggestions(call)).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(mocks.startExecution).not.toHaveBeenCalled();
    expect(mocks.resolveCredentials).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses an own-to-hosted source change before decryption", async () => {
    mocks.prisma.providerConnection.findUnique
      .mockResolvedValueOnce({
        credentialSource: "own",
        projectId: "project_1",
        provider: "dataforseo",
      })
      .mockResolvedValueOnce({
        credentialSource: "hosted",
        projectId: "project_1",
        provider: "dataforseo",
      });
    await expect(runSuggestions(vi.fn())).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(mocks.resolveCredentials).not.toHaveBeenCalled();
  });

  it("finishes a hosted rate-limit refusal without calling the provider", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "hosted",
      projectId: "project_1",
      provider: "dataforseo",
    });
    const finish = vi.fn().mockResolvedValue(undefined);
    mocks.startExecution.mockResolvedValue({
      credentials: { login: "shared", password: "fixture" },
      started: false,
      costCents: null,
      quantity: null,
      finish,
    });
    mocks.consumeLimit.mockResolvedValue({ success: false, resetAt: new Date() });
    const call = vi.fn();
    await expect(runSuggestions(call)).rejects.toMatchObject({
      outcome: { reason: "rate_limited" },
    });
    expect(finish).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
  });

  it("does not record a hosted callback that never begins or mark shared auth reauth", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "hosted",
      projectId: "project_1",
      provider: "dataforseo",
    });
    const finish = vi.fn().mockResolvedValue(undefined);
    mocks.startExecution.mockResolvedValue({
      credentials: { login: "shared", password: "fixture" },
      started: false,
      costCents: null,
      quantity: null,
      finish,
    });
    await expect(
      runSuggestions(vi.fn().mockResolvedValue({ costCents: 12 })),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    await expect(
      runSuggestions(vi.fn().mockRejectedValue(new ProviderAuthError("dataforseo"))),
    ).rejects.toBeInstanceOf(ProviderAuthError);
    expect(mocks.markReauth).not.toHaveBeenCalled();
    expect(mocks.prisma.providerCostEntry.createMany).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it("preserves a measured hosted failure cost and refuses an unobserved charged error", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialSource: "hosted",
      projectId: "project_1",
      provider: "dataforseo",
    });
    mocks.startExecution.mockResolvedValue({
      credentials: { login: "shared", password: "fixture" },
      started: true,
      costCents: 0.06,
      quantity: 1,
      finish: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      runSuggestions(vi.fn().mockRejectedValue(new ProviderCallError("charged", 99))),
    ).rejects.toMatchObject({ costCents: 0.06 });
    mocks.startExecution.mockResolvedValue({
      credentials: { login: "shared", password: "fixture" },
      started: false,
      costCents: null,
      quantity: null,
      finish: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      runSuggestions(vi.fn().mockRejectedValue(new ProviderCallError("charged", 99))),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(mocks.prisma.providerCostEntry.createMany).not.toHaveBeenCalled();
  });
});
