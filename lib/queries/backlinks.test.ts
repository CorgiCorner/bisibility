import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBacklinksPageContext } from "./backlinks";

const mocks = vi.hoisted(() => ({
  cost: vi.fn(),
  prisma: { backlinkSnapshot: { findMany: vi.fn() } },
  project: {
    domain: "example.com",
    id: "project_1",
    name: "Example",
    publicId: "prj_1",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./cost-calculator", () => ({ getProjectCostContext: mocks.cost }));

describe("backlinks page context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.cost.mockResolvedValue({ capCents: 5000, spentCents: 125 });
    mocks.prisma.backlinkSnapshot.findMany.mockResolvedValue([
      {
        expiresAt: new Date("2026-07-25T15:00:00.000Z"),
        fetchedAt: new Date("2026-07-24T15:00:00.000Z"),
        fetchedRowCount: 500,
        includeSubdomains: true,
        target: "example.com",
        targetScope: "site",
      },
      {
        expiresAt: new Date("2026-07-25T14:00:00.000Z"),
        fetchedAt: new Date("2026-07-24T14:00:00.000Z"),
        fetchedRowCount: 100,
        includeSubdomains: false,
        target: "https://example.com/pricing",
        targetScope: "page",
      },
    ]);
  });

  it("returns the five newest distinct target keys with cost and project defaults", async () => {
    await expect(getBacklinksPageContext("prj_1")).resolves.toEqual({
      costContext: { capCents: 5000, spentCents: 125 },
      defaultTarget: "example.com",
      recentTargets: [
        {
          cachedUntil: "2026-07-25T15:00:00.000Z",
          fetchedAt: "2026-07-24T15:00:00.000Z",
          includeSubdomains: true,
          resultLimit: 500,
          target: "example.com",
          targetScope: "site",
        },
        {
          cachedUntil: "2026-07-25T14:00:00.000Z",
          fetchedAt: "2026-07-24T14:00:00.000Z",
          includeSubdomains: false,
          resultLimit: 100,
          target: "https://example.com/pricing",
          targetScope: "page",
        },
      ],
    });
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.cost).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.backlinkSnapshot.findMany).toHaveBeenCalledWith({
      distinct: ["target", "targetScope", "includeSubdomains"],
      orderBy: { fetchedAt: "desc" },
      select: {
        expiresAt: true,
        fetchedAt: true,
        fetchedRowCount: true,
        includeSubdomains: true,
        target: true,
        targetScope: true,
      },
      take: 5,
      where: { projectId: "project_1" },
    });
  });
});
