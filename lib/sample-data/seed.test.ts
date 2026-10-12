import { randomBytes } from "node:crypto";
import { withRankCheckManualRate } from "@/lib/provider-rates/manual-rate";
import { hashApiKey, verifyApiKey } from "@/lib/providers/crypto";
import { DENSE_CHECK_COUNT } from "@/lib/sample-data/dense-position-series";
import { seed } from "@/prisma/seed";
import { beforeEach, describe, expect, it, vi } from "vitest";

const envSeededKeyName = "E2E examples key (env-seeded)";
const rawSeedKey = "bsb_key_test_e2e_quickstart_0001";

const mocks = vi.hoisted(() => {
  type ApiKeyRow = {
    hashedKey: string;
    lastUsedAt: Date | null;
    name: string;
    prefix: string;
    projectId: string;
    revokedAt?: Date | null;
  };

  const apiKeys: ApiKeyRow[] = [];
  const providerRates = new Map<string, { amountCents: string; feature: string }>();
  const projectIds: Record<string, string> = {
    prj_a62b9be6d88a6fd296b50d56: "project_newsite",
    prj_a82e5b164885df2735e01312: "project_acme",
  };

  const project = {
    upsert: vi.fn(({ create, update, where }) =>
      Promise.resolve({
        ...create,
        ...update,
        id: projectIds[where.publicId] ?? `project_${where.publicId}`,
        publicId: where.publicId,
      }),
    ),
  };

  return {
    apiKeys,
    providerRates,
    readBudgets: vi.fn(),
    writeBudget: vi.fn(),
    transaction: { project },
    prisma: {
      $disconnect: vi.fn(() => Promise.resolve()),
      $transaction: vi.fn(),
      apiKey: {
        upsert: vi.fn(({ create, update, where }) => {
          const existing = apiKeys.find((row) => row.hashedKey === where.hashedKey);
          if (existing) Object.assign(existing, update);
          else apiKeys.push({ ...create });
          return Promise.resolve(existing ?? create);
        }),
      },
      keyword: {
        deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
        upsert: vi.fn(({ create, where }) =>
          Promise.resolve({ ...create, id: `keyword_${where.publicId}` }),
        ),
      },
      keywordSchedule: { upsert: vi.fn(() => Promise.resolve({ id: "schedule_1" })) },
      keywordTag: { upsert: vi.fn(() => Promise.resolve({ id: "keyword_tag_1" })) },
      location: {
        upsert: vi.fn(({ where }) =>
          Promise.resolve({ id: `loc_${where.canonicalKey.replaceAll("@", "_")}` }),
        ),
      },
      membership: { upsert: vi.fn(() => Promise.resolve({ id: "membership_1" })) },
      oauthClient: { upsert: vi.fn(() => Promise.resolve({ id: "oc_bisibility_cli" })) },
      projectDefaults: {
        upsert: vi.fn(
          (_input: {
            create: { enabledExperimentalModules?: string[] };
            update: { enabledExperimentalModules?: string[] };
          }) => Promise.resolve({ id: "defaults_1" }),
        ),
      },
      projectMarket: {
        deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
        updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
        upsert: vi.fn(({ create }) =>
          Promise.resolve({ ...create, id: `market_${create.locationId}` }),
        ),
      },
      providerConnection: {
        deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
        upsert: vi.fn(
          (_input: { create: Record<string, unknown>; update: Record<string, unknown> }) =>
            Promise.resolve({ credentialSource: "own", id: "provider_connection_1" }),
        ),
      },
      providerConnectionRate: {
        upsert: vi.fn(({ create, update, where }) => {
          const { connectionId, feature } = where.connectionId_feature;
          const key = `${connectionId}:${feature}`;
          const existing = providerRates.get(key);
          const rate = existing ? { ...existing, ...update } : { ...create };
          providerRates.set(key, rate);
          return Promise.resolve(rate);
        }),
      },
      rankCheck: {
        createMany: vi.fn(
          (input: { data: Array<{ keywordId: string; requestedDepth?: number }> }) =>
            Promise.resolve({ count: input.data.length }),
        ),
        deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
      },
      tag: {
        upsert: vi.fn(({ create }) =>
          Promise.resolve({
            ...create,
            id: `tag_${create.name.toLowerCase().replace(/\s+/g, "_")}`,
          }),
        ),
      },
      user: { upsert: vi.fn(() => Promise.resolve({ id: "user_owner" })) },
    },
  };
});

vi.mock("@/lib/metering/spending-limit-store", () => ({
  readSpendingBudgets: mocks.readBudgets,
  putSpendingBudget: mocks.writeBudget,
}));

vi.mock("@/lib/generated/prisma/client", () => ({
  Device: { desktop: "desktop" },
  LocationKind: { country: "country" },
  PrismaClient: vi.fn(function PrismaClient() {
    return mocks.prisma;
  }),
  ProjectMarketStatus: { active: "active", paused: "paused", removed: "removed" },
  ProviderKind: { serp: "serp" },
  ProviderStatus: { connected: "connected" },
  RankCheckFrequency: {
    custom_cron: "custom_cron",
    daily: "daily",
    manual: "manual",
    monthly: "monthly",
    paused: "paused",
    weekly: "weekly",
  },
  Role: { owner: "owner" },
}));

function envSeededKey() {
  return mocks.apiKeys.find((row) => row.name === envSeededKeyName);
}

describe("database seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.apiKeys.length = 0;
    mocks.providerRates.clear();
    mocks.readBudgets.mockResolvedValue([]);
    mocks.prisma.$transaction.mockImplementation((run) => run(mocks.transaction));
  });

  it("bootstraps both workspace budgets and preserves an existing settings revision", async () => {
    vi.stubEnv("METERING_NAMESPACE", "seed-fixture");
    mocks.readBudgets.mockResolvedValueOnce([{ id: "project:project_acme:monthly", version: 7 }]);

    await seed();

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.project.upsert).toHaveBeenCalledTimes(2);
    expect(
      mocks.readBudgets.mock.calls.map(([, namespace, scopes]) => [namespace, scopes]),
    ).toEqual([
      ["seed-fixture", [{ kind: "group", namespace: "seed-fixture", group: "project_acme" }]],
      ["seed-fixture", [{ kind: "group", namespace: "seed-fixture", group: "project_newsite" }]],
    ]);
    // The public-id extension wraps each transaction; reads and writes must share that client.
    const budgetTransaction = mocks.readBudgets.mock.calls[1][0];
    expect(budgetTransaction).not.toBe(mocks.prisma);
    expect(budgetTransaction).toMatchObject({ project: { upsert: expect.any(Function) } });
    expect(mocks.writeBudget).toHaveBeenCalledExactlyOnceWith(
      budgetTransaction,
      expect.objectContaining({ id: "project:project_newsite:monthly", version: 1 }),
    );
  });

  it("opts both demo projects into Timeline without populating the empty project", async () => {
    await seed();
    const defaults = mocks.prisma.projectDefaults.upsert.mock.calls.map(([input]) => input);
    expect(defaults).toHaveLength(2);
    for (const input of defaults) {
      expect(input.create.enabledExperimentalModules).toContain("timeline");
      expect(input.update.enabledExperimentalModules).toContain("timeline");
    }
    expect(
      mocks.prisma.keyword.upsert.mock.calls.every(
        ([input]) => input.create.projectId === "project_acme",
      ),
    ).toBe(true);
  });

  it("opts both demo projects into Competitors", async () => {
    await seed();
    for (const [input] of mocks.prisma.projectDefaults.upsert.mock.calls) {
      expect(input.create.enabledExperimentalModules).toContain("competitors");
      expect(input.update.enabledExperimentalModules).toContain("competitors");
    }
  });

  it("does not create the env-seeded API key when the env var is unset", async () => {
    await seed();

    expect(envSeededKey()).toBeUndefined();
    expect(mocks.prisma.oauthClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ clientId: "bisibility-cli", requirePKCE: true }),
        where: { clientId: "bisibility-cli" },
      }),
    );
  });

  it("accepts the deterministic quickstart test API key", async () => {
    vi.stubEnv("BISIBILITY_SEED_API_KEY", rawSeedKey);

    await seed();

    const row = envSeededKey();
    expect(row).toBeDefined();
    expect(row?.projectId).toBe("project_acme");
    expect(row?.prefix).toBe(rawSeedKey.slice(0, 21));
    expect(row?.hashedKey).toBe(hashApiKey(rawSeedKey));
    expect(verifyApiKey(rawSeedKey, row?.hashedKey ?? "")).toBe(true);
  });

  it("accepts an application-generated live API key", async () => {
    const raw = `bsb_key_live_${randomBytes(24).toString("base64url")}`;
    vi.stubEnv("BISIBILITY_SEED_API_KEY", raw);

    await seed();

    expect(envSeededKey()?.hashedKey).toBe(hashApiKey(raw));
  });

  it.each([
    ["a passphrase", "correct horse battery staple"],
    ["a short body", "bsb_key_live_x"],
    ["whitespace in the body", "bsb_key_live_1234567890 12345678"],
    ["punctuation in the body", "bsb_key_live_123456789012345678$"],
  ])("rejects %s as an env-seeded API key", async (_description, raw) => {
    vi.stubEnv("BISIBILITY_SEED_API_KEY", raw);

    await expect(seed()).rejects.toThrow("BISIBILITY_SEED_API_KEY");
    expect(envSeededKey()).toBeUndefined();
  });

  it("uses the explicit seeded project ID shared with integration consumers", async () => {
    const seededProjectId = "prj_a11111111111111111111111";
    vi.stubEnv("BISIBILITY_SEEDED_PROJECT_ID", seededProjectId);

    await seed();

    expect(mocks.transaction.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { publicId: seededProjectId },
      }),
    );
    expect(mocks.transaction.project.upsert.mock.calls[0][0].create).not.toHaveProperty(
      "providerAllocationsInitializedAt",
    );
  });

  it("does not seed a redacted value as encrypted provider credentials", async () => {
    await seed();

    expect(mocks.prisma.providerConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ credentialsEncrypted: null, provider: "dataforseo" }),
        update: expect.objectContaining({ credentialsEncrypted: null }),
      }),
    );
  });

  it("seeds native rank pricing through the current rate authority", async () => {
    await seed();

    const [input] = mocks.prisma.providerConnection.upsert.mock.calls[0];
    expect(input.create).not.toHaveProperty("costPerCheckCents");
    expect(input.update).not.toHaveProperty("costPerCheckCents");
    expect(input.create.credentialSource).toBe("own");
    expect(mocks.prisma.providerConnectionRate.upsert).toHaveBeenCalledExactlyOnceWith({
      create: {
        amountCents: "1.5500",
        connectionId: "provider_connection_1",
        feature: "rank_check",
      },
      update: { amountCents: "1.5500" },
      where: {
        connectionId_feature: { connectionId: "provider_connection_1", feature: "rank_check" },
      },
    });
  });

  it("keeps native rank pricing idempotent without replacing other feature rates", async () => {
    mocks.providerRates.set("provider_connection_1:backlinks", {
      amountCents: "9.0000",
      feature: "backlinks",
    });
    await seed();
    await seed();

    expect(mocks.providerRates.size).toBe(2);
    expect(mocks.providerRates.get("provider_connection_1:backlinks")?.amountCents).toBe("9.0000");
    expect(
      withRankCheckManualRate({ credentialSource: "own", rates: [...mocks.providerRates.values()] })
        .costPerCheckCents,
    ).toBe("1.5500");
  });

  it("preserves hosted source and its retained native override without repricing it", async () => {
    mocks.prisma.providerConnection.upsert.mockResolvedValueOnce({
      credentialSource: "hosted",
      id: "provider_connection_1",
    });
    mocks.providerRates.set("provider_connection_1:rank_check", {
      amountCents: "7.0000",
      feature: "rank_check",
    });
    await seed();

    expect(mocks.prisma.providerConnection.upsert.mock.calls[0][0].update).not.toHaveProperty(
      "credentialSource",
    );
    expect(mocks.prisma.providerConnectionRate.upsert).not.toHaveBeenCalled();
    expect(mocks.providerRates.get("provider_connection_1:rank_check")?.amountCents).toBe("7.0000");
    expect(
      withRankCheckManualRate({
        credentialSource: "hosted",
        rates: [...mocks.providerRates.values()],
      }).costPerCheckCents,
    ).toBeNull();
  });

  it("seeds a repeatable validation-ready active project", async () => {
    await seed();
    await seed();

    const activeKeywordCreates = mocks.prisma.keyword.upsert.mock.calls
      .map(([input]) => input.create)
      .filter((create) => create.projectId === "project_acme");
    const firstRunPublicIds = activeKeywordCreates.slice(0, 20).map((create) => create.publicId);
    const secondRunPublicIds = activeKeywordCreates.slice(20).map((create) => create.publicId);

    expect(firstRunPublicIds).toHaveLength(20);
    expect(new Set(firstRunPublicIds).size).toBe(20);
    expect(firstRunPublicIds).toContain("kw_a66b1d3324211286732e81a1");
    expect(secondRunPublicIds).toEqual(firstRunPublicIds);
    expect(mocks.prisma.rankCheck.createMany).toHaveBeenCalledTimes(40);
    expect(
      mocks.prisma.rankCheck.createMany.mock.calls.every(
        ([input]) =>
          input.data.length === DENSE_CHECK_COUNT &&
          input.data.every((row) => row.keywordId && row.requestedDepth === 100),
      ),
    ).toBe(true);
  });

  it("seeds the three-market demo shown in the README dashboard", async () => {
    await seed();

    expect(mocks.prisma.projectMarket.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.projectMarket.updateMany).toHaveBeenCalledWith({
      data: { status: "removed" },
      where: {
        locationId: { notIn: ["loc_BE_ar", "loc_ES_en", "loc_ES"] },
        projectId: "project_acme",
      },
    });
    const marketCreates = mocks.prisma.projectMarket.upsert.mock.calls.map(
      ([input]) => input.create,
    );
    expect(marketCreates).toHaveLength(3);
    expect(marketCreates.map((market) => market.locationId)).toEqual([
      "loc_BE_ar",
      "loc_ES_en",
      "loc_ES",
    ]);
    expect(marketCreates.every((market) => market.projectId === "project_acme")).toBe(true);

    const keywordLocations = mocks.prisma.keyword.upsert.mock.calls
      .map(([input]) => input.create)
      .filter((create) => create.projectId === "project_acme")
      .map((create) => create.locationId);
    expect(new Set(keywordLocations)).toEqual(new Set(["loc_BE_ar", "loc_ES_en", "loc_ES"]));
  });
});
