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
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { count: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    keywordSchedule: { createMany: vi.fn() },
    keywordTag: { createMany: vi.fn() },
    project: { findFirst: vi.fn() },
    projectMarket: { findMany: vi.fn(), upsert: vi.fn() },
    savedKeyword: { deleteMany: vi.fn() },
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
    seedKeywordDispatchStates: vi.fn(),
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
// The dispatcher seed belongs to its own suite; stub it so this one stays on the market guard.
vi.mock("@/lib/rank-check/dispatcher-state", () => ({
  seedKeywordDispatchStates: mocks.seedKeywordDispatchStates,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const untracked = "Market ES@es is not tracked by this project. Add it in Markets first.";

function registryRow(status: "active" | "paused" | "removed") {
  return {
    location: { canonicalKey: "ES@es" },
    locationId: "loc_1",
    publicId: "pmkt_a00000000000000000000000",
    status,
  };
}

function addOneKeyword() {
  return addKeywords({
    keywords: ["rank tracker"],
    projectId: "prj_a00000000000000000000000",
  });
}

describe("keyword writes against an archived project market", () => {
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
        archivedAt: null,
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
        canonicalKey: "ES@es",
        cityName: null,
        countryCode: "ES",
        displayName: "Spain",
        gl: "es",
        hl: "es",
        id: "loc_1",
        kind: "country",
        languageLabel: "Spanish",
        primaryGeoCode: null,
        primaryGeoName: "Spain",
        regionCode: null,
        secondaryGeoName: "Spain",
      },
      warning: null,
    });
  });

  it("refuses the add-keyword action and leaves the archived market removed", async () => {
    const stored = [registryRow("removed")];
    mocks.prisma.projectMarket.findMany.mockResolvedValue(stored);

    await expect(addOneKeyword()).rejects.toMatchObject({
      marketName: "ES@es",
      message: untracked,
      name: "MarketArchivedError",
    });
    expect(stored[0]?.status).toBe("removed");
    expect(mocks.prisma.projectMarket.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.keyword.createMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it.each(["active", "paused"] as const)(
    "still creates the keyword in a %s market without touching its status",
    async (status) => {
      mocks.prisma.projectMarket.findMany.mockResolvedValue([registryRow(status)]);

      await expect(addOneKeyword()).resolves.toMatchObject({ created: 1 });
      expect(mocks.prisma.projectMarket.upsert).not.toHaveBeenCalled();
      expect(mocks.prisma.keyword.createMany).toHaveBeenCalledOnce();
    },
  );
});
