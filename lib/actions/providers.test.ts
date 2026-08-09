import { resetRateLimitStateForTests } from "@/lib/api/ratelimit";
import { monthlyCostCentsFor } from "@/lib/cost-estimate/project-estimate";
import { decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { clearProviderRateLimitState, consumeProviderLimit } from "@/lib/providers/rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectProvider,
  disconnectProvider,
  setPrimaryProvider,
  testConnection,
  updateProviderCost,
  updateProviderRate,
} from "./providers";

const mocks = vi.hoisted(() => {
  const provider = {
    fetchKeywordMetrics: vi.fn(),
    fetchRank: vi.fn(),
    id: "serpapi",
    label: "SerpApi",
    testConnection: vi.fn(),
  };
  const analyticsProvider = {
    id: "plausible",
    label: "Plausible",
    queryStats: vi.fn(),
    testConnection: vi.fn(),
  };

  return {
    actor: { id: "user_1" },
    analyticsProvider,
    getActionActor: vi.fn(),
    provider,
    prisma: {
      $transaction: vi.fn(),
      project: { findUnique: vi.fn() },
      providerConnection: {
        delete: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      providerConnectionRate: {
        deleteMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    },
    project: { id: "project_1", ownerId: "user_1", publicId: "prj_a00000000000000000000000" },
    requireProjectScope: vi.fn(),
    revalidatePath: vi.fn(),
    startTrafficSyncWorkflow: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/registry", () => ({
  getAnalyticsProvider: vi.fn(() => mocks.analyticsProvider),
  getSerpProvider: vi.fn(() => mocks.provider),
  serpProviderCapabilities: vi.fn(() => ({
    keywordMetrics: true,
    keywordResearch: true,
    rankCheck: true,
    rankedKeywords: true,
  })),
  PROVIDER_CATALOG: [
    {
      defaultStatus: "ready",
      id: "dataforseo",
      kind: "serp",
      label: "DataForSEO",
      requiredCredentials: ["login", "password"],
    },
    {
      defaultStatus: "ready",
      id: "serpapi",
      kind: "serp",
      label: "SerpApi",
      requiredCredentials: ["apiKey"],
    },
    { defaultStatus: "optional", id: "gsc", kind: "analytics", label: "Google Search Console" },
    { defaultStatus: "optional", id: "ga4", kind: "analytics", label: "Google Analytics 4" },
    {
      defaultStatus: "optional",
      id: "plausible",
      kind: "analytics",
      label: "Plausible",
      requiredCredentials: ["apiKey", "login"],
    },
  ],
}));
vi.mock("@/lib/temporal/traffic-client", () => ({
  startTrafficSyncWorkflow: mocks.startTrafficSyncWorkflow,
}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
  revalidateKeywordViews: () => {
    mocks.revalidatePath("/app/keywords");
  },
  revalidateProviderViews: () => {
    mocks.revalidatePath("/app/integrations");
    mocks.revalidatePath("/app/overview");
    mocks.revalidatePath("/app/settings");
    mocks.revalidatePath("/app/settings/audit");
  },
}));

function connection(overrides: Record<string, unknown> = {}) {
  return {
    costPerCheckCents: 0.01,
    credentialsEncrypted: null,
    enabled: true,
    id: "conn_1",
    kind: "serp",
    priority: 100,
    provider: "serpapi",
    publicId: "conn_a00000000000000000000000",
    status: "connected",
    ...overrides,
  };
}

function nonPlainConnection(overrides: Record<string, unknown> = {}) {
  class DecimalValue {
    constructor(readonly value: string) {}

    toString() {
      return this.value;
    }
  }

  return connection({
    ...overrides,
    costPerCheckCents: new DecimalValue(String(overrides.costPerCheckCents ?? "1.2300")),
    createdAt: new Date("2026-07-23T10:00:00.000Z"),
    credentialsEncrypted: overrides.credentialsEncrypted ?? "encrypted-provider-credentials",
    updatedAt: new Date("2026-07-23T10:00:00.000Z"),
  });
}

describe("provider actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStateForTests();
    clearProviderRateLimitState();
    process.env.REDIS_URL = "";
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED = "";
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_SERPAPI_PER_MINUTE = "";
    mocks.getActionActor.mockResolvedValue(mocks.actor);
    mocks.provider.testConnection.mockResolvedValue({ message: "ok", ok: true });
    mocks.analyticsProvider.testConnection.mockResolvedValue({ message: "ok", ok: true });
    mocks.requireProjectScope.mockResolvedValue(mocks.project);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.project.findUnique.mockResolvedValue({ publicId: mocks.project.publicId });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    mocks.prisma.providerConnectionRate.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnectionRate.deleteMany.mockResolvedValue({ count: 0 });
    mocks.writeAudit.mockResolvedValue({});
    mocks.startTrafficSyncWorkflow.mockResolvedValue({
      runId: "run_1",
      workflowId: "maintenance-traffic-sync",
    });
  });

  it("rejects invalid input before reading the actor", async () => {
    await expect(connectProvider({ projectId: "", providerId: "serpapi" })).rejects.toThrow();

    expect(mocks.getActionActor).not.toHaveBeenCalled();
  });

  it("connects a primary provider with encrypted credentials and priority zero", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.upsert.mockImplementation(({ create }) =>
      Promise.resolve(nonPlainConnection({ ...create, id: "conn_1" })),
    );

    const result = await connectProvider({
      costPerCheck: 0.0123,
      enabled: false,
      login: "login",
      primary: true,
      priority: 20,
      projectId: "prj_a00000000000000000000000",
      providerId: "dataforseo",
      secret: "password",
    });

    const stored =
      mocks.prisma.providerConnection.upsert.mock.calls[0][0].create.credentialsEncrypted;
    expect(stored).not.toContain("password");
    expect(JSON.parse(decryptSecret(stored))).toEqual({ login: "login", password: "password" });
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith({
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      select: { id: true, provider: true },
      where: { kind: "serp", projectId: "project_1" },
    });
    expect(mocks.prisma.providerConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ costPerCheckCents: 1.23 }),
        update: expect.objectContaining({ costPerCheckCents: 1.23 }),
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ costPerCheck: 0.0123 }),
      }),
      mocks.prisma,
    );
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("password");
  });

  it("stores an unset cost per check as null instead of a zero rate", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.upsert.mockImplementation(({ create }) =>
      Promise.resolve(connection({ ...create, id: "conn_1" })),
    );

    await connectProvider({
      login: "login",
      primary: true,
      projectId: "prj_a00000000000000000000000",
      providerId: "dataforseo",
      secret: "password",
    });

    const call = mocks.prisma.providerConnection.upsert.mock.calls[0][0];
    expect(call.create.costPerCheckCents).toBeNull();
    expect(call.update).not.toHaveProperty("costPerCheckCents");
    expect(
      monthlyCostCentsFor(
        {
          depth: 100,
          deviceCount: 1,
          frequency: "daily",
          keywordCount: 1,
          locationCount: 1,
        },
        { overrideCents: call.create.costPerCheckCents, providerId: "dataforseo" },
      ),
    ).toBe(46.5);
  });

  it("keeps a stored secret when a non-secret provider field is updated", async () => {
    const storedCredentials = encryptSecret(
      JSON.stringify({ login: "old-login", password: "stored-password" }),
    );
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(
      connection({ credentialsEncrypted: storedCredentials, provider: "dataforseo" }),
    );
    mocks.prisma.providerConnection.upsert.mockImplementation(({ update }) =>
      Promise.resolve(connection({ ...update, id: "conn_1", provider: "dataforseo" })),
    );

    await connectProvider({
      login: "new-login",
      projectId: "prj_a00000000000000000000000",
      providerId: "dataforseo",
    });

    expect(mocks.provider.testConnection).toHaveBeenCalledWith({
      login: "new-login",
      password: "stored-password",
    });
    const encrypted =
      mocks.prisma.providerConnection.upsert.mock.calls[0][0].update.credentialsEncrypted;
    expect(JSON.parse(decryptSecret(encrypted))).toEqual({
      login: "new-login",
      password: "stored-password",
    });
  });

  it("starts an initial traffic sync after connecting an enabled analytics provider", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    mocks.prisma.providerConnection.upsert.mockImplementation(({ create }) =>
      Promise.resolve(connection({ ...create, id: "conn_analytics" })),
    );

    await connectProvider({
      credentials: {
        apiKey: "plausible-key",
        endpoint: "https://plausible.io",
        login: "example.com",
      },
      projectId: "prj_a00000000000000000000000",
      providerId: "plausible",
    });

    expect(mocks.startTrafficSyncWorkflow).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/app/keywords");
  });

  it("promotes a connected primary provider inside one transaction", async () => {
    const tx = {
      providerConnection: {
        findMany: vi.fn(() => Promise.resolve([])),
        update: vi.fn(),
        upsert: vi.fn(({ create }) => Promise.resolve(connection({ ...create, id: "conn_tx" }))),
      },
    };
    mocks.prisma.$transaction.mockImplementationOnce((callback) => callback(tx));
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);

    await connectProvider({
      primary: true,
      projectId: "prj_a00000000000000000000000",
      providerId: "serpapi",
      secret: "api-key",
    });

    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.providerConnection.findMany).toHaveBeenCalledOnce();
    expect(tx.providerConnection.upsert).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "provider.connect",
        targetId: expect.stringMatching(/^conn_[a-z][a-z0-9]{23}$/),
      }),
      tx,
    );
  });

  it("tests a connection with stored encrypted credentials", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "stored-key" })),
    });
    mocks.provider.testConnection.mockResolvedValue({ message: "ok", ok: true });

    await expect(
      testConnection({ projectId: "prj_a00000000000000000000000", providerId: "serpapi" }),
    ).resolves.toEqual({
      message: "ok",
      ok: true,
    });
    expect(mocks.provider.testConnection).toHaveBeenCalledWith({ apiKey: "stored-key" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "provider.test" }),
    );
  });

  it("rejects missing required credentials before calling the provider", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(
      connection({ credentialsEncrypted: null }),
    );

    await expect(
      testConnection({ projectId: "prj_a00000000000000000000000", providerId: "dataforseo" }),
    ).resolves.toEqual({
      message: "DataForSEO requires API login and API password credentials.",
      ok: false,
    });

    expect(mocks.provider.testConnection).not.toHaveBeenCalled();
  });

  it("returns a friendly rate-limited result without hitting the provider", async () => {
    process.env.BISIBILITY_PROVIDER_RATE_LIMIT_SERPAPI_PER_MINUTE = "1";
    // Exhaust the shared serpapi budget for these credentials before the test call.
    await consumeProviderLimit("serpapi", { apiKey: "stored-key" }, { projectId: "project_1" });
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "stored-key" })),
    });

    await expect(
      testConnection({ projectId: "prj_a00000000000000000000000", providerId: "serpapi" }),
    ).resolves.toEqual({
      message: "Rate limited, try again shortly.",
      ok: false,
      rateLimited: true,
    });
    expect(mocks.provider.testConnection).not.toHaveBeenCalled();
  });

  it("enables a promoted connection and assigns it priority zero", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connection({ id: "conn_2" }));
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({ id: "conn_2", provider: "serpapi" }),
    ]);
    mocks.prisma.providerConnection.update.mockResolvedValue(
      nonPlainConnection({ enabled: true, id: "conn_2", priority: 0 }),
    );

    const result = await setPrimaryProvider({
      enabled: false,
      primary: true,
      priority: 42,
      projectId: "prj_a00000000000000000000000",
      providerId: "serpapi",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.providerConnection.update).toHaveBeenNthCalledWith(1, {
      data: { priority: 0 },
      where: { id: "conn_2" },
    });
    expect(mocks.prisma.providerConnection.update).toHaveBeenNthCalledWith(2, {
      data: { enabled: true },
      where: { id: "conn_2" },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "provider.set_settings" }),
      mocks.prisma,
    );
  });

  it("promotes the third connection without changing the others' relative order", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(
      connection({ id: "conn_3", priority: 2 }),
    );
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({ id: "conn_1", priority: 0, provider: "dataforseo" }),
      connection({ id: "conn_2", priority: 1, provider: "local-sequence" }),
      connection({ id: "conn_3", priority: 2, provider: "serpapi" }),
    ]);
    mocks.prisma.providerConnection.update.mockImplementation(({ data, where }) =>
      Promise.resolve(nonPlainConnection({ ...data, id: where.id })),
    );

    await setPrimaryProvider({
      primary: true,
      projectId: "prj_a00000000000000000000000",
      providerId: "serpapi",
    });

    const priorities = mocks.prisma.providerConnection.update.mock.calls.flatMap(([query]) =>
      typeof query.data.priority === "number"
        ? [{ id: query.where.id, priority: query.data.priority }]
        : [],
    );
    expect(priorities).toEqual([
      { id: "conn_3", priority: 0 },
      { id: "conn_1", priority: 1 },
      { id: "conn_2", priority: 2 },
    ]);
  });

  it("updates provider cost without touching credentials", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connection({ id: "conn_3" }));
    mocks.prisma.providerConnection.update.mockResolvedValue(
      nonPlainConnection({ costPerCheckCents: 50, id: "conn_3" }),
    );

    const result = await updateProviderCost({
      costPerCheck: 0.5,
      projectId: "prj_a00000000000000000000000",
      providerId: "serpapi",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.prisma.providerConnection.update).toHaveBeenCalledWith({
      data: { costPerCheckCents: 50 },
      where: { id: "conn_3" },
    });
    expect(mocks.prisma.providerConnectionRate.upsert).toHaveBeenCalledWith({
      create: {
        amountCents: 50,
        connectionId: "conn_3",
        feature: "rank_check",
      },
      update: { amountCents: 50 },
      where: {
        connectionId_feature: {
          connectionId: "conn_3",
          feature: "rank_check",
        },
      },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ costPerCheck: 0.5 }),
        before: expect.objectContaining({ costPerCheck: 0.0001 }),
      }),
      mocks.prisma,
    );
  });

  it("stores and clears a feature-specific manual rate", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connection({ id: "conn_3" }));
    mocks.prisma.providerConnectionRate.upsert.mockResolvedValue({
      amountCents: 2,
      connectionId: "conn_3",
      feature: "keyword_metrics",
      id: "rate_1",
    });

    await expect(
      updateProviderRate({
        costPerUnit: 0.02,
        feature: "keyword_metrics",
        projectId: "prj_a00000000000000000000000",
        providerId: "dataforseo",
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.prisma.providerConnectionRate.upsert).toHaveBeenCalledWith({
      create: {
        amountCents: 2,
        connectionId: "conn_3",
        feature: "keyword_metrics",
      },
      update: { amountCents: 2 },
      where: {
        connectionId_feature: {
          connectionId: "conn_3",
          feature: "keyword_metrics",
        },
      },
    });
    expect(mocks.prisma.providerConnection.update).not.toHaveBeenCalled();

    await updateProviderRate({
      costPerUnit: null,
      feature: "rank_check",
      projectId: "prj_a00000000000000000000000",
      providerId: "dataforseo",
    });
    expect(mocks.prisma.providerConnectionRate.deleteMany).toHaveBeenCalledWith({
      where: { connectionId: "conn_3", feature: "rank_check" },
    });
    expect(mocks.prisma.providerConnection.update).toHaveBeenCalledWith({
      data: { costPerCheckCents: null },
      where: { id: "conn_3" },
    });
  });

  it("disconnects an existing provider and writes an audit event", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connection({ id: "conn_4" }));

    await expect(
      disconnectProvider({ projectId: "prj_a00000000000000000000000", providerId: "serpapi" }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.prisma.providerConnection.delete).toHaveBeenCalledWith({
      where: { id: "conn_4" },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "provider.disconnect" }),
      mocks.prisma,
    );
  });
});
