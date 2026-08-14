import { beforeEach, describe, expect, it, vi } from "vitest";
import { addKeywords } from "./keyword";

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
    requireSession: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

// Location resolution is covered by its own suite; stub it to a country row so
// this test focuses on paused-schedule creation.
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

describe("paused keyword create action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.prisma.user.findUnique.mockResolvedValue({
      memberships: [{ projectId: "project_1", role: "admin" }],
      role: "admin",
    });
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      publicId: "prj_a00000000000000000000000",
    });
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        device: "desktop",
        id: "keyword_1",
        intent: null,
        locationId: "loc_1",
        publicId: "kw_a00000000000000000000000",
        targetUrl: null,
        text: "rank tracker",
        topic: null,
      },
    ]);
    mocks.resolveKeywordLocation.mockResolvedValue({
      degraded: false,
      location: {
        canonicalKey: "US",
        cityName: null,
        countryCode: "US",
        displayName: "United States",
        gl: "us",
        hl: "en",
        id: "loc_1",
        kind: "country",
        languageLabel: "English",
        primaryGeoCode: null,
        primaryGeoName: "United States",
        regionCode: null,
        secondaryGeoName: "United States",
      },
      warning: null,
    });
  });

  it("creates keyword schedules as paused when the input schedule is paused", async () => {
    await addKeywords({
      keywords: ["rank tracker"],
      projectId: "prj_a00000000000000000000000",
      schedule: {
        cronExpression: null,
        frequency: "paused",
        jitterMinutes: 60,
        timezone: "UTC",
      },
    });

    expect(mocks.prisma.keywordSchedule.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          frequency: "paused",
          keywordId: "keyword_1",
          nextCheckAt: null,
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("creates structured CSV rows with row-specific metadata", async () => {
    mocks.resolveKeywordLocation.mockImplementation(async (input: { country?: string }) => ({
      degraded: false,
      location: {
        canonicalKey: input.country === "United Kingdom" ? "GB" : "US",
        cityName: null,
        countryCode: input.country === "United Kingdom" ? "GB" : "US",
        displayName: input.country ?? "United States",
        gl: input.country === "United Kingdom" ? "gb" : "us",
        hl: "en",
        id: input.country === "United Kingdom" ? "loc_gb" : "loc_us",
        kind: "country",
        languageLabel: "English",
        primaryGeoCode: null,
        primaryGeoName: input.country ?? "United States",
        regionCode: null,
        secondaryGeoName: input.country ?? "United States",
      },
      warning: null,
    }));
    mocks.prisma.keyword.findMany.mockReset();
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        device: "mobile",
        id: "keyword_1",
        intent: null,
        locationId: "loc_gb",
        publicId: "kw_a00000000000000000000000",
        targetUrl: "/rank",
        text: "rank tracker",
        topic: null,
      },
    ]);
    mocks.prisma.tag.findMany.mockResolvedValue([
      { id: "tag_1", name: "Core" },
      { id: "tag_2", name: "Product" },
    ]);

    await addKeywords({
      projectId: "prj_a00000000000000000000000",
      rows: [
        {
          device: "MOBILE",
          keyword: "rank tracker",
          location: "GB",
          tags: ["Core", "Product"],
          targetUrl: "/rank",
        },
      ],
    });

    expect(mocks.prisma.keyword.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            device: "mobile",
            location: "United Kingdom (English)",
            locationId: "loc_gb",
            targetUrl: "/rank",
            text: "rank tracker",
          }),
        ],
      }),
    );
    expect(mocks.prisma.tag.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          name: "Core",
          projectId: "project_1",
          publicId: expect.stringMatching(/^tag_[a-z][a-z0-9]{23}$/),
        }),
        expect.objectContaining({
          name: "Product",
          projectId: "project_1",
          publicId: expect.stringMatching(/^tag_[a-z][a-z0-9]{23}$/),
        }),
      ],
      skipDuplicates: true,
    });
  });
});
