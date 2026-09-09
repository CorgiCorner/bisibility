import { addKeywordsMatrixSchema } from "@/lib/schemas/keyword";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addKeywordsMatrix } from "./keyword";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor(readonly code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.name = "AuthorizationError";
    }
  }
  const prisma = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    keywordSchedule: { createMany: vi.fn() },
    keywordTag: { createMany: vi.fn() },
    savedKeyword: { deleteMany: vi.fn() },
    checkSchedule: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    projectMarket: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({ publicId: "pmkt_a00000000000000000000000" }),
    },
    tag: { createMany: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));

  return {
    AuthorizationError,
    authorize: vi.fn(() => ({ actorId: "user_1", projectId: "project_1", role: "admin" })),
    prisma,
    refreshKeywordDispatchStates: vi.fn(async () => 0),
    requireSession: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    revalidatePath: vi.fn(),
    readAnalyticsSurfaceFromHeaders: vi.fn(),
    readConsentFromCookies: vi.fn(),
    seedKeywordDispatchStates: vi.fn(async () => 0),
    trackServerEvent: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/analytics/server", () => ({
  readAnalyticsSurfaceFromHeaders: mocks.readAnalyticsSurfaceFromHeaders,
  readConsentFromCookies: mocks.readConsentFromCookies,
  trackServerEvent: mocks.trackServerEvent,
}));

vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/rank-check/dispatcher-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rank-check/dispatcher-state")>()),
  refreshKeywordDispatchStates: mocks.refreshKeywordDispatchStates,
  seedKeywordDispatchStates: mocks.seedKeywordDispatchStates,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const scheduleId = `sch_${"a".repeat(24)}`;

const projectSchedule = {
  archivedAt: null as Date | null,
  cronExpression: "0 6 * * 1",
  enabled: true,
  frequency: "weekly",
  id: "schedule_1",
  isDefault: false,
  jitterMinutes: 60,
  name: "Weekly Monday",
  projectId: "project_1",
  providerPolicy: null,
  publicId: scheduleId,
  serpDepth: null,
  timeOfDay: null,
  timezone: "UTC",
};

/**
 * Answer findFirst the way the database would: the row comes back when it satisfies every clause
 * the query actually asked for, so dropping a clause widens what the action accepts.
 */
function storedSchedule(stored: typeof projectSchedule | null) {
  return ({ where }: { where: Record<string, unknown> }) => {
    const row = stored as Record<string, unknown> | null;
    const matches =
      row !== null && Object.entries(where).every(([field, value]) => row[field] === value);
    return Promise.resolve(matches ? stored : null);
  };
}

/** The cadence statement the assigned schedule writes, whatever else the transaction executed. */
function cadenceUpsert() {
  const call = mocks.prisma.$executeRaw.mock.calls.find((args: unknown[]) =>
    String((args[0] as { sql?: string } | undefined)?.sql ?? "").includes(
      'INSERT INTO "keyword_schedules"',
    ),
  );
  if (!call) throw new Error("No keyword_schedules cadence statement was executed.");
  return call[0] as { sql: string; values: unknown[] };
}

function resolvedLocation(country: string) {
  return {
    degraded: false,
    location: {
      canonicalKey: country,
      cityName: null,
      countryCode: country.slice(0, 2).toUpperCase(),
      displayName: country,
      gl: country.slice(0, 2).toLowerCase(),
      hl: "en",
      id: `loc_${country.replaceAll(" ", "_")}`,
      kind: "country",
      languageLabel: "English",
      primaryGeoCode: null,
      primaryGeoName: country,
      regionCode: null,
      secondaryGeoName: country,
    },
    warning: null,
  };
}

describe("addKeywordsMatrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
    mocks.prisma.checkSchedule.findFirst.mockImplementation(storedSchedule(projectSchedule));
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "admin",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_a00000000000000000000000",
    });
    mocks.readAnalyticsSurfaceFromHeaders.mockResolvedValue("onboarding");
    mocks.readConsentFromCookies.mockResolvedValue({
      analytics: true,
      decidedAt: 1,
      replay: false,
      status: "decided",
    });
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.updateMany.mockReset();
    mocks.resolveKeywordLocation.mockImplementation((input) => {
      if ("selection" in input) {
        const selection = input.selection;
        const key = "canonicalKey" in selection ? selection.canonicalKey : selection.countryCode;
        return Promise.resolve(resolvedLocation(key));
      }
      return Promise.resolve(resolvedLocation(input.country));
    });
  });

  it("rejects imports that exceed the matrix combo cap", () => {
    const result = addKeywordsMatrixSchema.safeParse({
      devices: ["desktop", "mobile"],
      keywords: Array.from({ length: 500 }, (_, index) => `keyword ${index}`),
      locations: [{ locationKey: "US" }, { locationKey: "PL" }, { locationKey: "DE" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: "This import creates 3000 tracked keywords; the limit is 2000 per import.",
            path: ["keywords"],
          }),
        ]),
      );
    }
  });

  it("rejects an empty market matrix at the server boundary", () => {
    const result = addKeywordsMatrixSchema.safeParse({
      devices: ["desktop"],
      keywords: ["rank tracker"],
      locations: [],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["locations"] })]),
      );
    }
  });

  it("dedupes input case-insensitively and retries idempotently", async () => {
    const createdRows = [
      {
        device: "desktop",
        id: "keyword_1",
        intent: "commercial",
        locationId: "loc_US",
        publicId: "kw_a00000000000000000000000",
        targetUrl: null,
        text: "Rank Tracker",
        topic: "Product",
      },
      {
        device: "desktop",
        id: "keyword_2",
        intent: "commercial",
        locationId: "loc_US",
        publicId: "kw_b00000000000000000000000",
        targetUrl: null,
        text: "seo api",
        topic: "Product",
      },
    ];
    mocks.prisma.$queryRaw.mockResolvedValue([{ count: 2 }]);
    mocks.prisma.keyword.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(createdRows)
      .mockResolvedValueOnce(createdRows);

    const first = await addKeywordsMatrix({
      devices: ["desktop"],
      keywords: [" Rank Tracker ", "rank tracker", "seo api"],
      locations: [{ locationKey: "US" }],
      projectId: "prj_a00000000000000000000000",
      schedule: {
        cronExpression: null,
        frequency: "paused",
        jitterMinutes: 60,
        timezone: "UTC",
      },
      tags: [],
      targetUrl: null,
      topic: "Product",
      intent: "commercial",
    });
    const second = await addKeywordsMatrix({
      devices: ["desktop"],
      keywords: ["Rank Tracker", "seo api"],
      locations: [{ locationKey: "US" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(first).toMatchObject({ created: 2, persistedKeywordCount: 2, skippedDuplicates: 0 });
    expect(first.keywords).toEqual([
      expect.objectContaining({
        id: "kw_a00000000000000000000000",
        publicId: "kw_a00000000000000000000000",
      }),
      expect.objectContaining({
        id: "kw_b00000000000000000000000",
        publicId: "kw_b00000000000000000000000",
      }),
    ]);
    expect(second).toEqual({
      created: 0,
      persistedKeywordCount: 2,
      keywords: [],
      skippedDuplicates: 2,
    });
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.trackServerEvent).toHaveBeenNthCalledWith(1, "keywords_added", {
      consent: { analytics: true, decidedAt: 1, replay: false, status: "decided" },
      distinctId: "user_1",
      properties: {
        keyword_count: 2,
        market_count: 1,
        source: "manual",
        surface: "onboarding",
      },
    });
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ intent: "commercial", text: "Rank Tracker", topic: "Product" }),
          expect.objectContaining({ intent: "commercial", text: "seo api", topic: "Product" }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(mocks.prisma.keywordSchedule.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          frequency: "paused",
          keywordId: "keyword_1",
        }),
        expect.objectContaining({
          frequency: "paused",
          keywordId: "keyword_2",
        }),
      ],
      skipDuplicates: true,
    });
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
    expect(mocks.writeAudit).toHaveBeenCalledTimes(2);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ intent: "commercial", topic: "Product" }),
        targetId: "prj_a00000000000000000000000",
        targetType: "project",
      }),
      mocks.prisma,
    );
    expect(mocks.prisma.keywordSchedule.createMany).toHaveBeenCalledTimes(1);
  });

  it("assigns the chosen project schedule to the rows this submission creates", async () => {
    const created = [
      {
        device: "desktop",
        id: "keyword_1",
        intent: null,
        locationId: "loc_US",
        publicId: "kw_a00000000000000000000000",
        targetUrl: null,
        text: "rank tracker",
        topic: null,
      },
    ];
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(created);

    await addKeywordsMatrix({
      checkScheduleId: scheduleId,
      devices: ["desktop"],
      keywords: ["rank tracker"],
      locations: [{ locationKey: "US" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(mocks.prisma.checkSchedule.findFirst).toHaveBeenCalledWith({
      where: { archivedAt: null, enabled: true, projectId: "project_1", publicId: scheduleId },
    });
    expect(mocks.prisma.keyword.updateMany).toHaveBeenCalledWith({
      data: { checkScheduleId: "schedule_1" },
      where: { id: { in: ["keyword_1"] } },
    });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ checkScheduleId: scheduleId }) }),
      mocks.prisma,
    );
  });

  it("overwrites a cadence this submission already wrote with the assigned schedule", async () => {
    const created = [
      {
        device: "desktop",
        id: "keyword_1",
        intent: null,
        locationId: "loc_US",
        publicId: "kw_a00000000000000000000000",
        targetUrl: null,
        text: "rank tracker",
        topic: null,
      },
    ];
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(created);

    await addKeywordsMatrix({
      checkScheduleId: scheduleId,
      devices: ["desktop"],
      keywords: ["rank tracker"],
      locations: [{ locationKey: "US" }],
      projectId: "prj_a00000000000000000000000",
      schedule: {
        cronExpression: null,
        frequency: "monthly",
        jitterMinutes: 60,
        timezone: "UTC",
      },
      tags: [],
      targetUrl: null,
    });

    // The per-keyword cadence lands first and owns the unique keywordId, so the assigned
    // schedule has to replace that row instead of skipping it as a duplicate.
    expect(mocks.prisma.keywordSchedule.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ frequency: "monthly", keywordId: "keyword_1" })],
      }),
    );
    const cadence = cadenceUpsert();
    expect(cadence.sql).toContain('ON CONFLICT ("keywordId") DO UPDATE');
    expect(cadence.values).toContain("weekly");
    expect(cadence.values).toContain("keyword_1");
  });

  it("recomputes the dispatch state the seeding pass could not know about", async () => {
    const created = [
      {
        device: "desktop",
        id: "keyword_1",
        intent: null,
        locationId: "loc_US",
        publicId: "kw_a00000000000000000000000",
        targetUrl: null,
        text: "rank tracker",
        topic: null,
      },
    ];
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(created);

    await addKeywordsMatrix({
      checkScheduleId: scheduleId,
      devices: ["desktop"],
      keywords: ["rank tracker"],
      locations: [{ locationKey: "US" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(mocks.seedKeywordDispatchStates).toHaveBeenCalledWith(["keyword_1"], {}, mocks.prisma);
    expect(mocks.refreshKeywordDispatchStates).toHaveBeenCalledWith(
      { keywordIds: ["keyword_1"] },
      mocks.prisma,
    );
    expect(mocks.refreshKeywordDispatchStates.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.seedKeywordDispatchStates.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["an unknown schedule", null],
    ["a schedule from another project", { ...projectSchedule, projectId: "project_2" }],
    ["a disabled schedule", { ...projectSchedule, enabled: false }],
    ["an archived schedule", { ...projectSchedule, archivedAt: new Date() }],
  ])("refuses %s without writing keywords or an audit", async (_name, stored) => {
    mocks.prisma.checkSchedule.findFirst.mockImplementation(storedSchedule(stored));
    mocks.prisma.keyword.findMany.mockResolvedValue([]);

    await expect(
      addKeywordsMatrix({
        checkScheduleId: scheduleId,
        devices: ["desktop"],
        keywords: ["rank tracker"],
        locations: [{ locationKey: "US" }],
        projectId: "prj_a00000000000000000000000",
        tags: [],
        targetUrl: null,
      }),
    ).rejects.toThrow(/schedule/i);

    expect(mocks.prisma.keyword.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a schedule identifier that is not a project schedule public id", () => {
    const result = addKeywordsMatrixSchema.safeParse({
      checkScheduleId: "schedule_1",
      devices: ["desktop"],
      keywords: ["rank tracker"],
      locations: [{ locationKey: "US" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(result.success).toBe(false);
  });

  it("keeps a batch target URL on every market the submission creates", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        device: "desktop",
        id: "keyword_1",
        intent: null,
        locationId: "loc_US",
        publicId: "kw_a00000000000000000000000",
        targetUrl: "https://example.com/page",
        text: "rank tracker",
        topic: null,
      },
      {
        device: "desktop",
        id: "keyword_2",
        intent: null,
        locationId: "loc_PL",
        publicId: "kw_b00000000000000000000000",
        targetUrl: "https://example.com/page",
        text: "rank tracker",
        topic: null,
      },
    ]);

    await addKeywordsMatrix({
      devices: ["desktop"],
      keywords: ["rank tracker"],
      locations: [{ locationKey: "US" }, { locationKey: "PL" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: "https://example.com/page",
    });

    // The drawer states that the URL applies to all keywords, and the audit records it as
    // supplied, so no row may be created without it.
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ locationId: "loc_US", targetUrl: "https://example.com/page" }),
          expect.objectContaining({ locationId: "loc_PL", targetUrl: "https://example.com/page" }),
        ],
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ targetUrl: "https://example.com/page" }),
      }),
      mocks.prisma,
    );
  });

  it("fans two terms across two markets and two devices without touching an existing row", async () => {
    const existing = {
      checkScheduleId: "schedule_old",
      device: "desktop",
      id: "keyword_existing",
      intent: null,
      locationId: "loc_US",
      publicId: "kw_z00000000000000000000000",
      targetUrl: null,
      text: "rank tracker",
      topic: null,
    };
    const tuples = ["loc_US", "loc_PL"].flatMap((locationId) =>
      ["desktop", "mobile"].flatMap((device) =>
        ["rank tracker", "seo api"].map((text) => ({ device, locationId, text })),
      ),
    );
    const inserted = tuples
      .filter(
        (tuple) =>
          !(
            tuple.device === "desktop" &&
            tuple.locationId === "loc_US" &&
            tuple.text === "rank tracker"
          ),
      )
      .map((tuple, index) => ({
        ...tuple,
        id: `keyword_${index + 1}`,
        intent: null,
        publicId: `kw_${String.fromCharCode(97 + index)}00000000000000000000000`,
        targetUrl: null,
        topic: null,
      }));
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([existing]).mockResolvedValueOnce(inserted);

    const result = await addKeywordsMatrix({
      checkScheduleId: scheduleId,
      devices: ["desktop", "mobile"],
      keywords: ["rank tracker", "seo api"],
      locations: [{ locationKey: "US" }, { locationKey: "PL" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(inserted).toHaveLength(7);
    expect(result.created).toBe(7);
    expect(result.skippedDuplicates).toBe(1);
    expect(mocks.prisma.keyword.updateMany).toHaveBeenCalledWith({
      data: { checkScheduleId: "schedule_1" },
      where: { id: { in: inserted.map((keyword) => keyword.id) } },
    });
    expect(existing.checkScheduleId).toBe("schedule_old");
    expect(mocks.writeAudit).toHaveBeenCalledTimes(1);
  });

  it("consumes promoted saved keywords for each language-qualified market", async () => {
    mocks.resolveKeywordLocation.mockResolvedValue({
      ...resolvedLocation("ES@en"),
      location: {
        ...resolvedLocation("ES@en").location,
        canonicalKey: "ES@en",
        id: "loc_ES@en",
      },
    });
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        device: "desktop",
        id: "keyword_1",
        intent: null,
        locationId: "loc_ES@en",
        publicId: "kw_a00000000000000000000000",
        targetUrl: null,
        text: "rank tracker",
        topic: null,
      },
    ]);

    await addKeywordsMatrix({
      consumeSavedIds: ["skw_a00000000000000000000000"],
      devices: ["desktop"],
      keywords: ["rank tracker"],
      locations: [{ locationKey: "ES@en" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(mocks.prisma.savedKeyword.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            countryCode: "ES",
            languageCode: "en",
            location: "ES@en",
            normalizedText: "rank tracker",
          },
        ],
        projectId: "project_1",
        publicId: { in: ["skw_a00000000000000000000000"] },
      },
    });
  });

  it("refuses to add keywords until the workspace has a domain", async () => {
    mocks.prisma.project.findFirst.mockResolvedValue({
      domain: null,
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_a00000000000000000000000",
    });

    await expect(
      addKeywordsMatrix({
        devices: ["desktop"],
        keywords: ["alpha"],
        locations: [{ locationKey: "US" }],
        projectId: "prj_a00000000000000000000000",
        tags: [],
        targetUrl: null,
      }),
    ).rejects.toThrow(/Settings > Project details/);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not audit when the set-based matrix insert fails", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]);
    mocks.prisma.keyword.createMany.mockRejectedValueOnce(new Error("insert failed"));

    await expect(
      addKeywordsMatrix({
        devices: ["desktop", "mobile"],
        keywords: ["rank tracker"],
        locations: [{ locationKey: "US" }],
        projectId: "prj_a00000000000000000000000",
        tags: [],
        targetUrl: null,
      }),
    ).rejects.toThrow("insert failed");

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.resolveKeywordLocation).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns distinct warnings from degraded location resolutions", async () => {
    mocks.resolveKeywordLocation.mockResolvedValue({
      ...resolvedLocation("US"),
      warning: "Austin was not found; tracking United States instead.",
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.keyword.createMany.mockResolvedValue({ count: 1 });
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        device: "desktop",
        id: "keyword_1",
        intent: null,
        locationId: "loc_US",
        publicId: "kw_a00000000000000000000000",
        targetUrl: null,
        text: "rank tracker",
        topic: null,
      },
    ]);

    const result = await addKeywordsMatrix({
      devices: ["desktop"],
      keywords: ["rank tracker"],
      locations: [{ locationKey: "US/Texas/Austin" }],
      projectId: "prj_a00000000000000000000000",
      tags: [],
      targetUrl: null,
    });

    expect(result.warnings).toEqual(["Austin was not found; tracking United States instead."]);
  });
});
