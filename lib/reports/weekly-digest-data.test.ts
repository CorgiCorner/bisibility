import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectWeeklyDigestData } from "./weekly-digest-data";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { findMany: vi.fn() },
    project: { findFirst: vi.fn() },
    rankCheck: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const now = new Date("2026-07-04T12:00:00.000Z");
const rangeStart = new Date("2026-06-27T12:00:00.000Z");
const project = { domain: "example.com", id: "project_1", name: "Example" };

function rankCheck(overrides: Record<string, unknown>) {
  return {
    checkedAt: new Date("2026-07-03T12:00:00.000Z"),
    id: "check_1",
    keyword: { publicId: "kw_1", text: "keyword" },
    keywordId: "keyword_1",
    position: 3,
    status: "completed",
    ...overrides,
  };
}

describe("collectWeeklyDigestData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.project.findFirst.mockResolvedValue(project);
  });

  it("aggregates movers, average delta, failed checks, and checked keywords", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValueOnce([
      rankCheck({
        checkedAt: new Date("2026-07-03T12:00:00.000Z"),
        id: "check_kw1_latest",
        keyword: { publicId: "kw_one", text: "keyword one" },
        keywordId: "keyword_1",
        position: 3,
      }),
      rankCheck({
        id: "check_kw2_latest",
        keyword: { publicId: "kw_two", text: "keyword two" },
        keywordId: "keyword_2",
        position: 7,
      }),
      rankCheck({
        id: "check_kw3_latest",
        keyword: { publicId: "kw_three", text: "keyword three" },
        keywordId: "keyword_3",
        position: null,
      }),
      rankCheck({
        id: "check_kw4_latest",
        keyword: { publicId: "kw_four", text: "keyword four" },
        keywordId: "keyword_4",
        position: 20,
      }),
      rankCheck({ id: "failed_1", keywordId: "keyword_1", position: null, status: "failed" }),
      rankCheck({ id: "failed_2", keywordId: "keyword_2", position: null, status: "failed" }),
      rankCheck({
        checkedAt: new Date("2026-07-01T12:00:00.000Z"),
        id: "check_kw1_old",
        keyword: { publicId: "kw_one", text: "keyword one" },
        keywordId: "keyword_1",
        position: 5,
      }),
    ]);
    mocks.prisma.keyword.findMany.mockResolvedValueOnce([
      { id: "keyword_1", rankChecks: [{ position: 8 }] },
      { id: "keyword_2", rankChecks: [{ position: 4 }] },
      { id: "keyword_3", rankChecks: [{ position: 10 }] },
      { id: "keyword_4", rankChecks: [] },
    ]);

    const result = await collectWeeklyDigestData("project_1", now);

    expect(result).toEqual({
      avgPositionDelta: 1,
      checkedKeywords: 4,
      failedChecksCount: 2,
      projectDomain: "example.com",
      projectName: "Example",
      rangeEnd: now,
      rangeStart,
      topMovers: [
        { delta: 5, from: 8, keyword: "keyword one", publicId: "kw_one", to: 3 },
        { delta: -3, from: 4, keyword: "keyword two", publicId: "kw_two", to: 7 },
      ],
    });
    expect(mocks.prisma.rankCheck.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          checkedAt: { gte: rangeStart, lt: now },
          keyword: { projectId: "project_1" },
          status: { in: ["completed", "failed"] },
        },
      }),
    );
    expect(mocks.prisma.keyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: expect.arrayContaining(["keyword_1", "keyword_2", "keyword_3", "keyword_4"]),
          },
          projectId: "project_1",
        },
      }),
    );
  });

  it("returns null when the weekly window has no completed or failed checks", async () => {
    mocks.prisma.rankCheck.findMany.mockResolvedValueOnce([]);

    await expect(collectWeeklyDigestData("project_1", now)).resolves.toBeNull();

    expect(mocks.prisma.rankCheck.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.keyword.findMany).not.toHaveBeenCalled();
  });
});
