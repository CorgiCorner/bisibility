import { hashApiKey } from "@/lib/providers/crypto";
import { appPath } from "@/lib/routing/app-path";
import type { ResolveKeywordLocationInput } from "@/lib/serp/location-service";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueApiKey } from "./apiKey";
import { addKeyword, addKeywords, updateKeyword } from "./keyword";
import { bulkDeleteKeywords, bulkSetFrequency } from "./keyword-bulk";
import { testConnection } from "./providers";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    code: "forbidden" | "unauthenticated";

    constructor(code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.code = code;
      this.name = "AuthorizationError";
    }
  }
  const roleRank = { admin: 2, auditor: 0.5, member: 1, owner: 3, viewer: 0 };
  const minimumRoleByAction = {
    create: "member",
    delete: "admin",
    manage: "admin",
    read: "viewer",
    update: "member",
  } as const;
  const createdKeywords: Array<Record<string, unknown>> = [];
  const prisma = {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    apiKey: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    keyword: {
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    keywordSchedule: { createMany: vi.fn(), upsert: vi.fn() },
    savedKeyword: { deleteMany: vi.fn() },
    keywordTag: { createMany: vi.fn(), deleteMany: vi.fn() },
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    projectMarket: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({ publicId: "pmkt_a00000000000000000000000" }),
    },
    providerConnection: { findUnique: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    tag: { createMany: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  const provider = {
    fetchRank: vi.fn(),
    id: "dataforseo",
    label: "DataForSEO",
    testConnection: vi.fn(),
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));

  return {
    AuthorizationError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) {
        throw new AuthorizationError("unauthenticated");
      }
      const role = resource.projectId
        ? actor.memberships?.find(
            (item: { projectId: string }) => item.projectId === resource.projectId,
          )?.role
        : resource.ownerId === actor.id
          ? "owner"
          : actor.role;
      const requiredRole =
        resource.requiredRole ?? minimumRoleByAction[action as keyof typeof minimumRoleByAction];
      if (
        !role ||
        roleRank[role as keyof typeof roleRank] < roleRank[requiredRole as keyof typeof roleRank]
      ) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    createdKeywords,
    prisma,
    provider,
    requireSession: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

// Stub location resolution to a deterministic country row so these tests stay
// focused on authorization and scheduling.
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: mocks.requireSession,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/providers/registry", () => ({
  getAnalyticsProvider: vi.fn(),
  getSerpProvider: vi.fn(() => mocks.provider),
  PROVIDER_CATALOG: [
    { defaultStatus: "ready", id: "dataforseo", kind: "serp", label: "DataForSEO" },
    { defaultStatus: "ready", id: "serpapi", kind: "serp", label: "SerpApi" },
    { defaultStatus: "optional", id: "gsc", kind: "analytics", label: "Google Search Console" },
    { defaultStatus: "optional", id: "ga4", kind: "analytics", label: "Google Analytics 4" },
  ],
}));

function mockActor(
  role: "admin" | "auditor" | "member" | "owner" | "viewer",
  projectId = "project_1",
) {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: projectId ? [{ projectId, role }] : [],
    role: "member",
  });
}

function mockProject() {
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: "prj_a00000000000000000000000",
  });
}

function scheduleInput(overrides: Record<string, unknown> = {}) {
  return {
    cronExpression: null,
    frequency: "weekly",
    ...overrides,
  };
}
describe("server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createdKeywords.length = 0;
    mockActor("admin");
    mockProject();
    mocks.prisma.project.findUnique.mockResolvedValue({
      publicId: "prj_a00000000000000000000000",
    });
    mocks.writeAudit.mockResolvedValue({});
    mocks.resolveKeywordLocation.mockImplementation(async (input: ResolveKeywordLocationInput) => {
      let country: string;
      let city: string | null | undefined;
      if ("selection" in input) {
        country =
          "canonicalKey" in input.selection
            ? input.selection.canonicalKey
            : input.selection.countryCode;
        city = input.selection.kind === "city" ? "Austin" : null;
      } else {
        country = input.country;
        city = input.city;
      }
      return {
        degraded: false,
        location: {
          canonicalKey: country === "United States" ? "US" : country,
          cityName: city ?? null,
          countryCode: "US",
          displayName: city ? `${city},${country}` : country,
          gl: "us",
          hl: "en",
          id: "loc_1",
          kind: city ? "city" : "country",
          languageCode: "en",
          languageLabel: "English",
          primaryGeoCode: null,
          primaryGeoName: country,
          regionCode: null,
          secondaryGeoName: country,
        },
        warning: null,
      };
    });
    mocks.prisma.keyword.count.mockResolvedValue(0);
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.keyword.createMany.mockImplementation(({ data }) => {
      for (const item of data) {
        mocks.createdKeywords.push({
          ...item,
          id: `keyword_${mocks.createdKeywords.length + 1}`,
        });
      }
      return Promise.resolve({ count: data.length });
    });
    mocks.prisma.keyword.findMany.mockImplementation(({ where = {} } = {}) => {
      if (where.publicId?.in) {
        return Promise.resolve(
          mocks.createdKeywords.filter((row) => where.publicId.in.includes(row.publicId)),
        );
      }
      if (where.locationId?.in && where.device?.in && where.text?.in) {
        return Promise.resolve(
          mocks.createdKeywords.filter(
            (row) =>
              row.projectId === where.projectId &&
              where.locationId.in.includes(row.locationId) &&
              where.device.in.includes(row.device) &&
              where.text.in.includes(row.text),
          ),
        );
      }
      return Promise.resolve([]);
    });
    mocks.prisma.tag.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects invalid input with Zod before reading the session", async () => {
    await expect(
      addKeyword({ keyword: "", projectId: "prj_a00000000000000000000000" }),
    ).rejects.toThrow();

    expect(mocks.requireSession).not.toHaveBeenCalled();
  });

  it("denies destructive actions for the wrong project role", async () => {
    mockActor("viewer");

    await expect(
      bulkDeleteKeywords({
        keywordIds: ["kw_a00000000000000000000000"],
        projectId: "prj_a00000000000000000000000",
      }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.prisma.keyword.deleteMany).not.toHaveBeenCalled();
  });

  it("denies mutations when the actor is not a project member", async () => {
    mockActor("member", "");

    await expect(
      addKeyword({
        keyword: "rank tracker",
        location: "United States",
        projectId: "prj_a00000000000000000000000",
      }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.prisma.keyword.upsert).not.toHaveBeenCalled();
  });

  it("blocks keyword mutations while project migration hold is active", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_a00000000000000000000000",
      writeMode: "migration_hold",
    });

    await expect(
      addKeyword({
        keyword: "rank tracker",
        location: "United States",
        projectId: "prj_a00000000000000000000000",
      }),
    ).rejects.toMatchObject({ code: "project_read_only" });

    expect(mocks.prisma.keyword.upsert).not.toHaveBeenCalled();
  });

  it("writes audit records after keyword mutations", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([]);

    await addKeyword({
      intent: "commercial",
      keyword: "rank tracker",
      location: "United States",
      projectId: "prj_a00000000000000000000000",
      topic: "Product",
    });

    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            intent: "commercial",
            location: "United States",
            topic: "Product",
          }),
        ],
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "keyword.add",
        after: expect.objectContaining({
          intent: "commercial",
          text: "rank tracker",
          topic: "Product",
        }),
        targetId: expect.stringMatching(/^kw_/),
      }),
      mocks.prisma,
    );
  });

  it("adds a language suffix only for a non-default market row", async () => {
    mocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: {
        canonicalKey: "ES/Andalusia/Malaga@en",
        cityName: "Malaga",
        countryCode: "ES",
        displayName: "Malaga, Andalusia, Spain",
        gl: "es",
        hl: "en",
        id: "loc_es_en",
        kind: "city",
        languageCode: "en",
        languageLabel: "English",
        primaryGeoCode: 1000080,
        primaryGeoName: "Malaga,Andalusia,Spain",
        regionCode: "AN",
        secondaryGeoName: "Malaga, Andalusia, Spain",
      },
      warning: null,
    });

    await addKeyword({
      keyword: "rank tracker",
      locationKey: "ES/Andalusia/Malaga@en",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ location: "Malaga, Andalusia, Spain (English)" })],
      }),
    );
  });

  it("revalidates keyword, dependent alert/competitor, activity, and audit views after keyword mutations", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([]);

    await addKeyword({
      keyword: "rank tracker",
      location: "United States",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "rank-tracker"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/app/[project]/rank-tracker/[id]", "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "dashboard"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "alerts"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "competitors"), "page");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      appPath("[project]", "settings", "audit"),
      "page",
    );
  });

  it("resolves add keyword locations by selected canonical key before legacy fields", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([]);

    await addKeyword({
      keyword: "rank tracker",
      location: "Germany",
      locationKey: "US/Texas/Austin",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.resolveKeywordLocation).toHaveBeenCalledWith({
      projectId: "project_1",
      selection: { canonicalKey: "US/Texas/Austin", kind: "city" },
    });
  });

  it("persists keyword topic and intent after adding keywords in bulk", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([]);

    await addKeywords({
      intent: "commercial",
      keywords: ["rank tracker", "seo tool"],
      location: "United States",
      projectId: "prj_a00000000000000000000000",
      schedule: scheduleInput(),
      topic: "Product",
    });

    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ intent: "commercial", text: "rank tracker", topic: "Product" }),
          expect.objectContaining({ intent: "commercial", text: "seo tool", topic: "Product" }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(mocks.prisma.keywordSchedule.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ keywordId: "keyword_1" }),
        expect.objectContaining({ keywordId: "keyword_2" }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ intent: "commercial", topic: "Product" }),
        targetId: "prj_a00000000000000000000000",
        targetType: "project",
      }),
      mocks.prisma,
    );
  });

  it("allows an app keyword batch exactly at the configured project limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "2");
    mocks.prisma.keyword.count.mockResolvedValue(1);

    await expect(
      addKeywords({
        keywords: ["rank tracker"],
        location: "United States",
        projectId: "prj_a00000000000000000000000",
      }),
    ).resolves.toMatchObject({ created: 1 });
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledOnce();
  });

  it("leaves app keyword creation unlimited when the project cap is zero", async () => {
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "0");

    await addKeywords({
      keywords: ["rank tracker"],
      location: "United States",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.prisma.keyword.count).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledOnce();
  });

  it("rejects an app keyword batch atomically above the configured project limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "2");
    mocks.prisma.keyword.count.mockResolvedValue(1);

    await expect(
      addKeywords({
        keywords: ["rank tracker", "seo tool"],
        location: "United States",
        projectId: "prj_a00000000000000000000000",
      }),
    ).rejects.toThrow("This project is limited to 2 keywords. Delete keywords before adding more.");
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("consumes only the requested project saved rows after keyword creation succeeds", async () => {
    await addKeywords({
      consumeSavedIds: ["svkw_a00000000000000000000000", "svkw_c00000000000000000000000"],
      keywords: ["Rank Tracker"],
      location: "United States",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.prisma.savedKeyword.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            countryCode: "US",
            languageCode: "en",
            location: "US",
            normalizedText: "rank tracker",
          },
        ],
        projectId: "project_1",
        publicId: { in: ["svkw_a00000000000000000000000", "svkw_c00000000000000000000000"] },
      },
    });
  });

  it("consumes a duplicate-only saved promotion at the project cap", async () => {
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "1");
    mocks.prisma.keyword.count.mockResolvedValue(1);
    mocks.createdKeywords.push({
      device: "desktop",
      id: "keyword_existing",
      intent: null,
      locationId: "loc_1",
      projectId: "project_1",
      publicId: "kw_d00000000000000000000000",
      targetUrl: null,
      text: "Rank Tracker",
      topic: null,
    });

    await expect(
      addKeywords({
        consumeSavedIds: ["svkw_a00000000000000000000000"],
        keywords: ["Rank Tracker"],
        location: "United States",
        projectId: "prj_a00000000000000000000000",
      }),
    ).resolves.toMatchObject({ created: 0 });

    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.savedKeyword.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            countryCode: "US",
            languageCode: "en",
            location: "US",
            normalizedText: "rank tracker",
          },
        ],
        projectId: "project_1",
        publicId: { in: ["svkw_a00000000000000000000000"] },
      },
    });
  });

  it("consumes both created and duplicate tuples from a mixed saved promotion", async () => {
    mocks.createdKeywords.push({
      device: "desktop",
      id: "keyword_existing",
      intent: null,
      locationId: "loc_1",
      projectId: "project_1",
      publicId: "kw_d00000000000000000000000",
      targetUrl: null,
      text: "Rank Tracker",
      topic: null,
    });

    await addKeywords({
      consumeSavedIds: ["svkw_a00000000000000000000000", "svkw_b00000000000000000000000"],
      keywords: ["Rank Tracker", "SEO Tool"],
      location: "United States",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.prisma.savedKeyword.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            countryCode: "US",
            languageCode: "en",
            location: "US",
            normalizedText: "rank tracker",
          },
          {
            countryCode: "US",
            languageCode: "en",
            location: "US",
            normalizedText: "seo tool",
          },
        ],
        projectId: "project_1",
        publicId: {
          in: ["svkw_a00000000000000000000000", "svkw_b00000000000000000000000"],
        },
      },
    });
  });

  it("derives each consumed saved pair from promoted row locations", async () => {
    await addKeywords({
      consumeSavedIds: [
        "svkw_a00000000000000000000000",
        "svkw_b00000000000000000000000",
        "svkw_d00000000000000000000000",
      ],
      projectId: "prj_a00000000000000000000000",
      rows: [
        { device: "desktop", keyword: "Rank Tracker", location: "United States" },
        { device: "desktop", keyword: "SEO Tool", location: "Poland", locationKey: "PL" },
      ],
    });

    expect(mocks.prisma.savedKeyword.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            countryCode: "US",
            languageCode: "en",
            location: "US",
            normalizedText: "rank tracker",
          },
          {
            countryCode: "PL",
            languageCode: "pl",
            location: "PL",
            normalizedText: "seo tool",
          },
        ],
        projectId: "project_1",
        publicId: {
          in: [
            "svkw_a00000000000000000000000",
            "svkw_b00000000000000000000000",
            "svkw_d00000000000000000000000",
          ],
        },
      },
    });
  });

  it("leaves saved rows intact when keyword creation fails", async () => {
    mocks.prisma.keyword.createMany.mockRejectedValueOnce(new Error("insert failed"));

    await expect(
      addKeywords({
        consumeSavedIds: ["svkw_a00000000000000000000000"],
        keywords: ["rank tracker"],
        location: "United States",
        projectId: "prj_a00000000000000000000000",
      }),
    ).rejects.toThrow("insert failed");

    expect(mocks.prisma.savedKeyword.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes keywords without app-side schedule deletion", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { id: "keyword_1", publicId: "kw_a00000000000000000000000", text: "rank tracker" },
      { id: "keyword_2", publicId: "kw_b00000000000000000000000", text: "seo tool" },
    ]);

    await bulkDeleteKeywords({
      keywordIds: ["kw_a00000000000000000000000", "kw_b00000000000000000000000"],
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.prisma.keyword.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["keyword_1", "keyword_2"] } },
    });
  });

  it("persists schedule intent after bulk frequency changes", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { id: "keyword_1", publicId: "kw_a00000000000000000000000" },
      { id: "keyword_2", publicId: "kw_b00000000000000000000000" },
    ]);

    await bulkSetFrequency({
      keywordIds: ["kw_a00000000000000000000000", "kw_b00000000000000000000000"],
      projectId: "prj_a00000000000000000000000",
      schedule: scheduleInput({ frequency: "paused" }),
    });

    expect(mocks.prisma.keywordSchedule.upsert).toHaveBeenCalledTimes(2);
  });

  it("does not include targetUrl when keyword update input omits it", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      project: { id: "project_1", publicId: "prj_a00000000000000000000000", writeMode: "active" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      location: "United States",
      targetUrl: "https://example.com/canonical-target",
      text: "rank tracker",
    });
    mocks.prisma.keyword.update.mockResolvedValue({
      id: "keyword_1",
      publicId: "kw_a00000000000000000000000",
      targetUrl: "https://example.com/canonical-target",
      text: "rank tracker",
    });

    await updateKeyword({ device: "mobile", keywordId: "kw_a00000000000000000000000" });

    const updateData = mocks.prisma.keyword.update.mock.calls[0][0].data;
    expect(Object.hasOwn(updateData, "targetUrl")).toBe(false);
  });

  it("persists keyword topic and intent during updates", async () => {
    mocks.prisma.keyword.findFirst.mockResolvedValue({
      id: "keyword_1",
      project: { id: "project_1", publicId: "prj_a00000000000000000000000", writeMode: "active" },
      projectId: "project_1",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      device: "desktop",
      intent: null,
      location: "United States",
      targetUrl: null,
      text: "rank tracker",
      topic: null,
    });
    mocks.prisma.keyword.update.mockResolvedValue({
      id: "keyword_1",
      intent: "informational",
      publicId: "kw_a00000000000000000000000",
      targetUrl: null,
      text: "rank tracker",
      topic: "Docs",
    });

    await updateKeyword({
      intent: "informational",
      keywordId: "kw_a00000000000000000000000",
      topic: "Docs",
    });

    expect(mocks.prisma.keyword.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ intent: "informational", topic: "Docs" }),
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ intent: "informational", topic: "Docs" }),
        before: expect.objectContaining({ intent: null, topic: null }),
      }),
    );
  });

  it("writes keyword intent without app-side Temporal sync", async () => {
    mocks.prisma.tag.findMany.mockResolvedValue([]);

    await addKeyword({
      keyword: "rank tracker",
      location: "United States",
      projectId: "prj_a00000000000000000000000",
    });

    expect(mocks.prisma.keyword.createMany).toHaveBeenCalled();
  });

  it("leaves schedule reconciliation to the worker", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      { id: "keyword_1", publicId: "kw_a00000000000000000000000", text: "rank tracker" },
    ]);

    await bulkDeleteKeywords({
      keywordIds: ["kw_a00000000000000000000000"],
      projectId: "prj_a00000000000000000000000",
    });
    await bulkSetFrequency({
      keywordIds: ["kw_a00000000000000000000000"],
      projectId: "prj_a00000000000000000000000",
      schedule: scheduleInput({ frequency: "paused" }),
    });

    expect(mocks.prisma.keyword.deleteMany).toHaveBeenCalled();
    expect(mocks.prisma.keywordSchedule.upsert).toHaveBeenCalled();
  });

  it("tests providers through the mocked adapter and audits the attempt", async () => {
    mocks.provider.testConnection.mockResolvedValue({ message: "ok", ok: true });

    const result = await testConnection({
      login: "login",
      projectId: "prj_a00000000000000000000000",
      providerId: "dataforseo",
      secret: "secret",
    });

    expect(result).toEqual({ message: "ok", ok: true });
    expect(mocks.provider.testConnection).toHaveBeenCalledWith({
      login: "login",
      password: "secret",
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "provider.test" }),
    );
  });

  it("returns an issued API key once and stores only its hash", async () => {
    let stored: Record<string, unknown> | undefined;
    mocks.prisma.apiKey.create.mockImplementation(({ data }) => {
      stored = data;
      return Promise.resolve({
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "key_1",
        name: data.name,
        prefix: data.prefix,
        publicId: "key_a00000000000000000000000",
      });
    });

    const result = await issueApiKey({
      name: "Production",
      projectId: "prj_a00000000000000000000000",
    });

    expect(result.raw).toMatch(/^bsb_key_live_/);
    expect(stored?.hashedKey).toBe(hashApiKey(result.raw));
    expect(stored?.hashedKey).not.toContain(result.raw);
    expect(stored).not.toHaveProperty("raw");
  });
});
