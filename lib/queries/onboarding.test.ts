import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOnboardingKeywordCount,
  getOnboardingProjectMarketKeys,
  hasActiveOnboardingApiKey,
} from "./onboarding";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    apiKey: { findFirst: vi.fn() },
    projectMarket: { findMany: vi.fn() },
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
