import { randomBytes } from "node:crypto";
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
  const projectIds: Record<string, string> = {
    prj_a62b9be6d88a6fd296b50d56: "project_newsite",
    prj_a82e5b164885df2735e01312: "project_acme",
  };

  return {
    apiKeys,
    prisma: {
      $disconnect: vi.fn(() => Promise.resolve()),
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
      location: { upsert: vi.fn(() => Promise.resolve({ id: "loc_us" })) },
      membership: { upsert: vi.fn(() => Promise.resolve({ id: "membership_1" })) },
      oauthClient: { upsert: vi.fn(() => Promise.resolve({ id: "oc_bisibility_cli" })) },
      project: {
        upsert: vi.fn(({ create, update, where }) =>
          Promise.resolve({
            ...create,
            ...update,
            id: projectIds[where.publicId] ?? `project_${where.publicId}`,
            publicId: where.publicId,
          }),
        ),
      },
      projectDefaults: { upsert: vi.fn(() => Promise.resolve({ id: "defaults_1" })) },
      providerConnection: {
        deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
        upsert: vi.fn(() => Promise.resolve({ id: "provider_connection_1" })),
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

vi.mock("@/lib/generated/prisma/client", () => ({
  Device: { desktop: "desktop" },
  LocationKind: { country: "country" },
  PrismaClient: vi.fn(function PrismaClient() {
    return mocks.prisma;
  }),
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

    expect(mocks.prisma.project.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: seededProjectId } }),
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
});
