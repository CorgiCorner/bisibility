import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCompetitorSetSettings } from "./competitor-set-settings";

const mocks = vi.hoisted(() => ({
  prisma: {
    competitor: { findMany: vi.fn() },
    projectMarket: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

describe("getCompetitorSetSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.competitor.findMany.mockResolvedValue([
      {
        aliases: ["Sanity"],
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        domain: "sanity.example.com",
        evidence: { bestPosition: 3, of: 12, seenOn: 9 },
        marketOverrides: [
          {
            mode: "excluded",
            projectMarket: {
              location: { displayName: "Flanders" },
              publicId: "pmkt_flanders",
              status: "active",
            },
          },
        ],
        projectId: "project_1",
        publicId: "cmp_sanity",
        scopePolicy: "all_markets",
        source: "suggested",
      },
      {
        aliases: ["Local brand"],
        createdAt: new Date("2026-09-02T00:00:00.000Z"),
        domain: "local.example.org",
        evidence: null,
        marketOverrides: [
          {
            mode: "added",
            projectMarket: {
              location: { displayName: "Flanders" },
              publicId: "pmkt_flanders",
              status: "active",
            },
          },
        ],
        projectId: "project_1",
        publicId: "cmp_local",
        scopePolicy: "selected_markets",
        source: "manual",
      },
    ]);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([
      { location: { displayName: "Flanders" }, publicId: "pmkt_flanders", status: "active" },
      { location: { displayName: "Wallonia" }, publicId: "pmkt_wallonia", status: "paused" },
    ]);
  });

  it("returns project rows with raw policy deltas and excludes archived markets from choices", async () => {
    const result = await getCompetitorSetSettings("project_1");

    expect(mocks.prisma.competitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "project_1" } }),
    );
    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: "project_1",
          status: { in: ["active", "paused"] },
        }),
      }),
    );
    expect(result.markets).toEqual([
      { id: "pmkt_flanders", label: "Flanders" },
      { id: "pmkt_wallonia", label: "Wallonia" },
    ]);
    expect(result.competitors).toEqual([
      expect.objectContaining({
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        evidence: { bestPosition: 3, of: 12, seenOn: 9 },
        overrides: [{ marketId: "pmkt_flanders", marketLabel: "Flanders", mode: "excluded" }],
        scopePolicy: "all_markets",
        source: "suggested",
      }),
      expect.objectContaining({
        overrides: [{ marketId: "pmkt_flanders", marketLabel: "Flanders", mode: "added" }],
        scopePolicy: "selected_markets",
        source: "manual",
      }),
    ]);
    expect(result.competitors).toHaveLength(2);
    expect(result.competitors[0]).not.toHaveProperty("members");
  });
});
