import { timelineGroups } from "@/lib/timeline/timeline-data";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTimelineView } from "./timeline";

const mocks = vi.hoisted(() => ({
  prisma: {
    signal: {
      findMany: vi.fn(),
    },
  },
  project: {
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_1",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

const now = new Date("2026-07-04T12:00:00.000Z");

function signalRow(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2026-07-04T10:30:00.000Z"),
    createdBy: { email: "jan@example.com", name: "Alex Example" },
    createdById: "user_1",
    happenedAt: new Date("2026-07-04T10:30:00.000Z"),
    id: "signal_1",
    keyword: { publicId: "kw_1", text: "seo software" },
    keywordId: "keyword_1",
    payload: { after: 14, before: 18, delta: 4 },
    projectId: "project_1",
    publicId: "sig_1",
    severity: "info",
    source: "rank_tracker",
    type: "ranking.changed",
    url: "https://example.com/pricing",
    ...overrides,
  };
}

describe("getTimelineView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.prisma.signal.findMany.mockResolvedValue([]);
  });

  it("loads project Signal rows newest-first", async () => {
    mocks.prisma.signal.findMany.mockResolvedValue([signalRow()]);

    const view = await getTimelineView("prj_1", { now });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.signal.findMany).toHaveBeenCalledWith({
      include: {
        createdBy: { select: { email: true, name: true } },
        keyword: { select: { publicId: true, text: true } },
      },
      orderBy: [{ happenedAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 21,
      where: { projectId: "project_1" },
    });
    expect(timelineGroups(view.rows, view.now)).toEqual([
      {
        day: "Today",
        items: [
          expect.objectContaining({
            meta: "Keyword: seo software · Rank tracker",
            position: "#14",
            title: "Position 18 → 14",
            urlLabel: "/pricing",
          }),
        ],
      },
    ]);
  });

  it.each([
    ["rankings", { source: "rank_tracker" }],
    [
      "pages",
      {
        OR: [
          { type: { in: ["sitemap.changed", "page.changed", "url.indexed", "url.deindexed"] } },
          { source: { in: ["sitemap", "url_inspection"] } },
        ],
      },
    ],
    ["deploys", { source: { in: ["deploy", "cms", "api"] } }],
    ["notes", { type: "note" }],
  ] as const)("applies the %s filter", async (filter, expected) => {
    await getTimelineView("prj_1", { filter, now });

    expect(mocks.prisma.signal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ projectId: "project_1" }, expected] },
      }),
    );
  });

  it("applies search and page options to the Signal query", async () => {
    await getTimelineView("prj_1", {
      filter: "pages",
      now,
      page: "2",
      pageSize: 10,
      q: "canonical",
    });

    expect(mocks.prisma.signal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 11,
        where: {
          AND: [
            { projectId: "project_1" },
            expect.objectContaining({
              OR: expect.arrayContaining([
                { publicId: { contains: "canonical", mode: "insensitive" } },
                { type: { contains: "canonical", mode: "insensitive" } },
                { url: { contains: "canonical", mode: "insensitive" } },
                {
                  payload: {
                    mode: "insensitive",
                    path: ["note"],
                    string_contains: "canonical",
                  },
                },
              ]),
            }),
            {
              OR: expect.arrayContaining([{ source: { in: ["sitemap", "url_inspection"] } }]),
            },
          ],
        },
      }),
    );
  });

  it("paginates by fetching one extra row", async () => {
    mocks.prisma.signal.findMany.mockResolvedValue([
      signalRow({ id: "signal_1" }),
      signalRow({ id: "signal_2" }),
      signalRow({ id: "signal_3" }),
    ]);

    const view = await getTimelineView("prj_1", { now, pageSize: 2 });

    expect(view.rows).toHaveLength(2);
    expect(view.hasNextPage).toBe(true);
    expect(view.hasPreviousPage).toBe(false);
  });

  it("normalizes invalid filters and empty pages", async () => {
    const view = await getTimelineView("prj_1", {
      filter: "unknown",
      now,
      page: "0",
      q: "missing",
    });

    expect(view.filter).toBe("all");
    expect(view.page).toBe(1);
    expect(view.rows).toEqual([]);
    expect(view.isFiltered).toBe(true);
  });
});
