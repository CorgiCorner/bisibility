import { beforeEach, describe, expect, it, vi } from "vitest";

const runnableWhere = { archivedAt: null, locationId: { in: ["location-active"] } };
const mocks = vi.hoisted(() => ({
  activeMarketLocationIds: vi.fn(),
  runnableKeywordWhere: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rank-check/runnable", () => mocks);

import { getCompetitorSuggestions } from "./suggestions";

const client = {
  competitor: { findMany: vi.fn() },
  competitorSuggestionDismissal: { findMany: vi.fn() },
  keyword: { findMany: vi.fn() },
  project: { findUnique: vi.fn() },
  projectMarket: { findMany: vi.fn() },
};
beforeEach(() => {
  vi.clearAllMocks();
  client.project.findUnique.mockResolvedValue({ domain: "bisibility.com" });
  client.competitor.findMany.mockResolvedValue([]);
  client.competitorSuggestionDismissal.findMany.mockResolvedValue([]);
  client.keyword.findMany.mockResolvedValue([]);
  mocks.activeMarketLocationIds.mockResolvedValue(new Set(["location-active"]));
  mocks.runnableKeywordWhere.mockReturnValue(runnableWhere);
});

describe("getCompetitorSuggestions", () => {
  it("reads only the latest completed snapshot per runnable keyword target", async () => {
    await getCompetitorSuggestions("project_1", client as never);
    expect(client.keyword.findMany).toHaveBeenCalledWith({
      select: {
        text: true,
        rankChecks: {
          orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { organicRanks: true, raw: true },
          where: { status: "completed" },
        },
      },
      where: { projectId: "project_1", ...runnableWhere },
    });
    expect(mocks.activeMarketLocationIds).toHaveBeenCalledWith("project_1", client);
    expect(mocks.runnableKeywordWhere).toHaveBeenCalledWith(new Set(["location-active"]));
  });

  it("excludes the persisted managed and dismissed domains before confirmation", async () => {
    client.competitor.findMany.mockResolvedValue([{ domain: "https://managed.org" }]);
    client.competitorSuggestionDismissal.findMany.mockResolvedValue([{ domain: "dismissed.org" }]);
    client.keyword.findMany.mockResolvedValue([
      {
        text: "rank tracker",
        rankChecks: [
          {
            raw: null,
            organicRanks: [
              { domain: "managed.org", position: 1 },
              { domain: "dismissed.org", position: 2 },
              { domain: "rival.org", position: 4 },
            ],
          },
        ],
      },
    ]);
    expect(await getCompetitorSuggestions("project_1", client as never)).toEqual([
      { domain: "rival.org", bestPosition: 4, of: 1, seenOn: 1, nonBrandSeenOn: 1, kind: "other" },
    ]);
  });

  it("does not query keyword data for a project without a valid domain", async () => {
    client.project.findUnique.mockResolvedValue(null);
    expect(await getCompetitorSuggestions("project_1", client as never)).toEqual([]);
    expect(client.keyword.findMany).not.toHaveBeenCalled();
  });
});
