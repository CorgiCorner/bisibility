import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existingOnboardingPlaceLocationKeys,
  getOnboardingKeywordCount,
  getOnboardingKeywordTexts,
  getOnboardingNextCheckAt,
  getOnboardingProjectMarketKeys,
  hasActiveOnboardingApiKey,
} from "./onboarding";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    apiKey: { findFirst: vi.fn() },
    location: { findMany: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    keywordDispatchState: { findFirst: vi.fn() },
    keyword: { findFirst: vi.fn(), findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
}));

describe("getOnboardingProjectMarketKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
    mocks.prisma.projectMarket.findMany.mockResolvedValue([
      { location: { canonicalKey: "US" } },
      { location: { canonicalKey: "ES@en" } },
    ]);
  });

  it("loads active and paused registry keys through readable project scope", async () => {
    await expect(getOnboardingProjectMarketKeys("prj_1")).resolves.toEqual(["US", "ES@en"]);

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { location: { select: { canonicalKey: true } } },
      where: {
        projectId: "project_1",
        status: { in: ["active", "paused"] },
      },
    });
  });
});

describe("getOnboardingKeywordCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
    mocks.prisma.$queryRaw.mockResolvedValue([{ count: 1 }]);
  });

  it("counts one keyword text once across its market and device targets", async () => {
    await expect(getOnboardingKeywordCount("prj_1")).resolves.toBe(1);

    expect(mocks.prisma.$queryRaw).toHaveBeenCalledOnce();
    const [query] = mocks.prisma.$queryRaw.mock.calls[0] ?? [];
    expect(Array.from(query ?? []).join(" ")).toContain('COUNT(DISTINCT lower(btrim("text")))');
  });
});

describe("hasActiveOnboardingApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.apiKey.findFirst.mockResolvedValue({ id: "key_1" });
  });

  it("excludes revoked and expired keys", async () => {
    await expect(hasActiveOnboardingApiKey("project_1")).resolves.toBe(true);

    expect(mocks.prisma.apiKey.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        projectId: "project_1",
        revokedAt: null,
      },
    });
  });
});

describe("getOnboardingNextCheckAt", () => {
  const now = new Date("2026-08-28T12:00:00Z");
  function defaults(frequency: string) {
    return {
      cronExpression: frequency === "daily" ? "0 6 * * *" : null,
      frequency,
      jitterMinutes: 0,
      timezone: "UTC",
    };
  }
  function keyword(
    id: string,
    nextCheckAt: string,
    schedule: ReturnType<typeof defaults> | null = null,
  ) {
    return {
      createdAt: new Date(),
      dispatchState: { nextCheckAt: new Date(nextCheckAt) },
      id,
      schedule,
    };
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(defaults("daily"));
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("returns null for a manual project default", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(defaults("manual"));
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword("keyword_1", "2026-08-29T06:00:00Z")]);
    await expect(getOnboardingNextCheckAt("prj_1")).resolves.toBeNull();
  });
  it("excludes a paused keyword override", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword("keyword_1", "2026-08-29T06:00:00Z", defaults("paused")),
    ]);
    await expect(getOnboardingNextCheckAt("prj_1")).resolves.toBeNull();
  });
  it("excludes stale dispatch rows", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword("keyword_1", "2026-08-27T06:00:00Z")]);
    await expect(getOnboardingNextCheckAt("prj_1")).resolves.toBeNull();
  });
  it("uses an inherited scheduled dispatch", async () => {
    const next = new Date("2026-08-29T06:00:00Z");
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword("keyword_1", next.toISOString())]);
    await expect(getOnboardingNextCheckAt("prj_1")).resolves.toEqual(next);
  });
  it("chooses the earliest runnable row from mixed schedules", async () => {
    const next = new Date("2026-08-29T05:00:00Z");
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword("manual", "2026-08-29T01:00:00Z", defaults("manual")),
      keyword("daily_late", "2026-08-30T06:00:00Z"),
      keyword("daily_next", next.toISOString()),
      keyword("paused", "2026-08-29T02:00:00Z", defaults("paused")),
    ]);
    await expect(getOnboardingNextCheckAt("prj_1")).resolves.toEqual(next);
  });
});

it("retains cached regions when validating resumed onboarding locations", async () => {
  mocks.prisma.location.findMany.mockResolvedValue([{ canonicalKey: "ES/Andalusia@en" }]);
  expect(await existingOnboardingPlaceLocationKeys(["ES/Andalusia@en"])).toEqual(
    new Set(["ES/Andalusia@en"]),
  );
  expect(mocks.prisma.location.findMany).toHaveBeenCalledWith({
    select: { canonicalKey: true },
    where: { canonicalKey: { in: ["ES/Andalusia@en"] }, kind: { in: ["city", "region"] } },
  });
});

it("loads one saved keyword text per identity across markets and devices", async () => {
  mocks.requireReadableProject.mockResolvedValue({ project: { id: "project_1" } });
  mocks.prisma.keyword.findMany.mockResolvedValue([{ text: "rank tracker" }, { text: "seo api" }]);
  expect(await getOnboardingKeywordTexts("prj_1")).toEqual(["rank tracker", "seo api"]);
  expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith({
    distinct: ["textNormalized"],
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { text: true },
    where: { projectId: "project_1", archivedAt: null },
  });
});
