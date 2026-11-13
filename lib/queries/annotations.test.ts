import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAnnotationsView } from "./annotations";

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

const now = new Date("2026-11-10T12:00:00.000Z");

describe("getAnnotationsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.getRequestProjectDefaults.mockResolvedValue({ timezone: "UTC" });
    mocks.prisma.signal.findMany.mockResolvedValue([]);
    mocks.prisma.searchEngineUpdate.findMany.mockResolvedValue([]);
  });

  it("loads context signals and overlapping global updates, never rank signals", async () => {
    mocks.prisma.signal.findMany.mockResolvedValue([
      {
        createdBy: { email: "member@example.com", name: "Member" },
        happenedAt: new Date("2026-11-09T10:00:00.000Z"),
        payload: { note: "A note" },
        publicId: "sig_note",
        source: "manual",
        type: "note",
        url: null,
      },
    ]);
    mocks.prisma.searchEngineUpdate.findMany.mockResolvedValue([
      {
        beginsAt: new Date("2026-09-24T16:15:00.000Z"),
        endsAt: new Date("2026-10-08T08:00:00.000Z"),
        externalId: "google_1",
        name: "September 2026 spam update",
        service: "Ranking",
        uri: "incidents/google_1",
      },
    ]);

    const view = await getAnnotationsView("prj_1", { now });

    expect(mocks.prisma.signal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          happenedAt: { gte: new Date("2026-08-12T12:00:00.000Z"), lte: now },
          projectId: "project_1",
          OR: [
            { source: { in: ["manual", "deploy", "cms", "api", "sitemap"] } },
            { source: "url_inspection", type: "url.deindexed" },
          ],
        },
      }),
    );
    expect(mocks.prisma.searchEngineUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          beginsAt: { lte: now },
          engine: "google",
          OR: [{ endsAt: null }, { endsAt: { gte: new Date("2026-08-12T12:00:00.000Z") } }],
        },
      }),
    );
    expect(view.signals).toEqual([
      expect.objectContaining({ actor: "Member", id: "sig_note", source: "manual" }),
    ]);
    expect(view.updates[0]).toMatchObject({ id: "google_1", name: "September 2026 spam update" });
    expect(JSON.stringify(view)).not.toContain("rank_tracker");
    expect(JSON.stringify(view)).not.toContain("search_analytics");
  });
});
