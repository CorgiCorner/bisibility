import { beforeEach, describe, expect, it, vi } from "vitest";
import { getChartAnnotations } from "./chart-annotations";

const mocks = vi.hoisted(() => ({
  getRequestProjectDefaults: vi.fn(),
  prisma: {
    searchEngineUpdate: { findMany: vi.fn() },
    signal: { findMany: vi.fn() },
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.getRequestProjectDefaults,
}));

describe("getChartAnnotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.getRequestProjectDefaults.mockResolvedValue({ timezone: "UTC" });
    mocks.prisma.signal.findMany.mockResolvedValue([]);
    mocks.prisma.searchEngineUpdate.findMany.mockResolvedValue([]);
  });

  it("reads one bounded signal query and one update query for the chart range", async () => {
    mocks.prisma.signal.findMany.mockResolvedValue([
      {
        happenedAt: new Date("2026-11-03T10:00:00.000Z"),
        payload: { note: "FAQ added" },
        publicId: "sig_note",
        source: "manual",
        type: "note",
        url: null,
      },
    ]);
    mocks.prisma.searchEngineUpdate.findMany.mockResolvedValue([
      {
        beginsAt: new Date("2026-11-01T00:00:00.000Z"),
        endsAt: new Date("2026-11-05T00:00:00.000Z"),
        externalId: "google_1",
        name: "November spam update",
        service: "Ranking",
        uri: "incidents/google_1",
      },
    ]);

    const markers = await getChartAnnotations("prj_1", {
      from: new Date("2026-11-01T12:00:00.000Z"),
      to: new Date("2026-11-07T12:00:00.000Z"),
    });

    expect(mocks.prisma.signal.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.signal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 400,
        where: expect.objectContaining({
          projectId: "project_1",
          OR: [
            { source: { in: ["manual", "deploy", "cms", "api", "sitemap"] } },
            { source: "url_inspection", type: "url.deindexed" },
          ],
        }),
      }),
    );
    expect(mocks.prisma.searchEngineUpdate.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.searchEngineUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        where: expect.objectContaining({ engine: "google" }),
      }),
    );
    expect(markers).toEqual([
      expect.objectContaining({
        dateKey: "2026-11-01",
        endDateKey: "2026-11-05",
        id: "google:google_1",
        kind: "search_engine",
        title: "November spam update",
      }),
      expect.objectContaining({ id: "sig_note", kind: "note", title: "FAQ added" }),
    ]);
  });
});
