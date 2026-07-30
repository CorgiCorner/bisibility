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
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { createMany: vi.fn(), findMany: vi.fn() },
    keywordSchedule: { createMany: vi.fn() },
    keywordTag: { createMany: vi.fn() },
    project: { findFirst: vi.fn() },
    tag: { createMany: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));

  return {
    AuthorizationError,
    authorize: vi.fn(() => ({ actorId: "user_1", projectId: "project_1", role: "admin" })),
    prisma,
    requireSession: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: mocks.resolveKeywordLocation,
}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

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
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "admin",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_a00000000000000000000000",
    });
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

    expect(first).toMatchObject({ created: 2, skippedDuplicates: 0 });
    expect(second).toEqual({ created: 0, keywords: [], skippedDuplicates: 2 });
    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledTimes(1);
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
