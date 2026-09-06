import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchPages: vi.fn(),
  fetchTotals: vi.fn(),
  markWindowFactsStale: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    organicSessionsDaily: { create: vi.fn(), deleteMany: vi.fn() },
    organicSessionsPageDaily: { count: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  },
  provenance: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/analytics/ga4-organic", () => ({
  fetchDailyOrganicSessionsByLandingPage: mocks.fetchPages,
  fetchDailyOrganicSessionsTotals: mocks.fetchTotals,
}));
vi.mock("./partitions", () => ({
  markWindowFactsStale: mocks.markWindowFactsStale,
  recordPartitionProvenance: mocks.provenance,
}));

const { syncOrganicSessionsRange } = await import("./sessions-partitions");

const credentials = { apiKey: "refresh_token", login: "123456789" };

describe("syncOrganicSessionsRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((write) => write(mocks.prisma));
    mocks.fetchTotals.mockResolvedValue([
      { date: "2026-07-07", sessions: 12 },
      { date: "2026-07-08", sessions: 14 },
    ]);
  });

  it("re-requests a capped remainder without deleting its later daily slices first", async () => {
    mocks.fetchPages
      .mockResolvedValueOnce({
        capHit: true,
        pages: 4,
        requestedRows: 100_000,
        rows: [
          { date: "2026-07-07", landingPage: "https://example.com/Guide/?ref=ad", sessions: 8 },
        ],
      })
      .mockResolvedValueOnce({
        capHit: false,
        pages: 1,
        requestedRows: 25_000,
        rows: [{ date: "2026-07-08", landingPage: "https://example.com/docs", sessions: 10 }],
      });

    await expect(
      syncOrganicSessionsRange({
        credentials,
        end: "2026-07-08",
        projectId: "project_1",
        property: "123456789",
        start: "2026-07-07",
      }),
    ).resolves.toEqual({ capHit: true });

    expect(mocks.fetchTotals).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPages).toHaveBeenNthCalledWith(1, {
      credentials,
      endDate: "2026-07-08",
      startDate: "2026-07-07",
    });
    expect(mocks.fetchPages).toHaveBeenNthCalledWith(2, {
      credentials,
      endDate: "2026-07-08",
      startDate: "2026-07-08",
    });
    expect(mocks.prisma.organicSessionsPageDaily.deleteMany.mock.calls).toEqual([
      [
        {
          where: {
            date: new Date("2026-07-07T00:00:00.000Z"),
            projectId: "project_1",
            property: "123456789",
          },
        },
      ],
      [
        {
          where: {
            date: new Date("2026-07-08T00:00:00.000Z"),
            projectId: "project_1",
            property: "123456789",
          },
        },
      ],
    ]);
    expect(
      mocks.prisma.organicSessionsPageDaily.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.fetchPages.mock.invocationCallOrder[1]);
    expect(mocks.prisma.organicSessionsPageDaily.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ path: "/Guide?ref=ad", sessions: 8 })],
      }),
    );
  });

  it("does not stale GSC window facts when it stores GA4 sessions", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      rows: [{ date: "2026-07-07", landingPage: "https://example.com/docs", sessions: 8 }],
    });

    await syncOrganicSessionsRange({
      credentials,
      end: "2026-07-07",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });

    expect(mocks.markWindowFactsStale).not.toHaveBeenCalled();
  });

  it("writes a truncated single-day report and terminates", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: true,
      pages: 4,
      requestedRows: 100_000,
      rows: [{ date: "2026-07-07", landingPage: "https://example.com/docs", sessions: 8 }],
    });

    await expect(
      syncOrganicSessionsRange({
        credentials,
        end: "2026-07-07",
        projectId: "project_1",
        property: "123456789",
        start: "2026-07-07",
      }),
    ).resolves.toEqual({ capHit: true });

    expect(mocks.fetchPages).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.organicSessionsPageDaily.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.provenance).toHaveBeenCalledWith(
      mocks.prisma,
      expect.objectContaining({
        dimensions: "date,landingPage",
        provenance: expect.objectContaining({ capHit: true }),
      }),
    );
  });

  it("re-requests the capped tail date after storing only complete earlier dates", async () => {
    mocks.fetchPages
      .mockResolvedValueOnce({
        capHit: true,
        pages: 4,
        requestedRows: 100_000,
        rows: [
          { date: "2026-07-07", landingPage: "/first", sessions: 8 },
          { date: "2026-07-08", landingPage: "/second", sessions: 9 },
          { date: "2026-07-09", landingPage: "/tail", sessions: 10 },
        ],
      })
      .mockResolvedValueOnce({
        capHit: false,
        pages: 1,
        requestedRows: 25_000,
        rows: [{ date: "2026-07-09", landingPage: "/tail", sessions: 11 }],
      });

    await syncOrganicSessionsRange({
      credentials,
      end: "2026-07-09",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });

    expect(mocks.fetchPages).toHaveBeenNthCalledWith(2, {
      credentials,
      endDate: "2026-07-09",
      startDate: "2026-07-09",
    });
    expect(mocks.prisma.organicSessionsPageDaily.deleteMany.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            where: expect.objectContaining({ date: new Date("2026-07-07T00:00:00.000Z") }),
          }),
        ],
        [
          expect.objectContaining({
            where: expect.objectContaining({ date: new Date("2026-07-08T00:00:00.000Z") }),
          }),
        ],
        [
          expect.objectContaining({
            where: expect.objectContaining({ date: new Date("2026-07-09T00:00:00.000Z") }),
          }),
        ],
      ]),
    );
    const pageProvenances = mocks.provenance.mock.calls
      .map(([, input]) => input)
      .filter((input) => input.dimensions === "date,landingPage");
    expect(pageProvenances).toHaveLength(3);
    expect(pageProvenances.every((input) => input.provenance.capHit === false)).toBe(true);
  });

  it("does not rewrite a day when a capped report has no usable rows", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: true,
      pages: 4,
      requestedRows: 100_000,
      rows: [],
    });

    await expect(
      syncOrganicSessionsRange({
        credentials,
        end: "2026-07-07",
        projectId: "project_1",
        property: "123456789",
        start: "2026-07-07",
      }),
    ).resolves.toEqual({ capHit: true });

    expect(mocks.prisma.organicSessionsPageDaily.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.organicSessionsDaily.deleteMany).not.toHaveBeenCalled();
    expect(mocks.provenance).not.toHaveBeenCalled();
  });

  it("persists supplied metrics and keeps omitted ones null", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      rows: [
        {
          date: "2026-07-07",
          engagedSessions: 7,
          keyEvents: 3,
          landingPage: "https://example.com/docs",
          sessions: 8,
        },
        {
          date: "2026-07-08",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "https://example.com/changelog",
          sessions: 10,
        },
      ],
    });

    await syncOrganicSessionsRange({
      credentials,
      end: "2026-07-08",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });

    const stored = mocks.prisma.organicSessionsPageDaily.createMany.mock.calls.map(
      (call) => call[0].data,
    );
    expect(stored).toEqual([
      [expect.objectContaining({ engagedSessions: 7, keyEvents: 3, sessions: 8 })],
      [expect.objectContaining({ engagedSessions: null, keyEvents: null, sessions: 10 })],
    ]);
  });

  it("keeps a merged path unknown when a later duplicate path metric is null", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      rows: [
        {
          date: "2026-07-07",
          engagedSessions: 7,
          keyEvents: 3,
          landingPage: "https://example.com/docs",
          sessions: 8,
        },
        {
          date: "2026-07-07",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "/docs",
          sessions: 9,
        },
      ],
    });

    await syncOrganicSessionsRange({
      credentials,
      end: "2026-07-07",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });

    expect(mocks.prisma.organicSessionsPageDaily.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            engagedSessions: null,
            keyEvents: null,
            path: "/docs",
            sessions: 17,
          }),
        ],
      }),
    );
  });

  it("keeps a merged path unknown when an earlier duplicate path metric is null", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      rows: [
        {
          date: "2026-07-07",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "https://example.com/docs",
          sessions: 8,
        },
        {
          date: "2026-07-07",
          engagedSessions: 7,
          keyEvents: 3,
          landingPage: "/docs",
          sessions: 9,
        },
      ],
    });

    await syncOrganicSessionsRange({
      credentials,
      end: "2026-07-07",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });

    expect(mocks.prisma.organicSessionsPageDaily.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            engagedSessions: null,
            keyEvents: null,
            path: "/docs",
            sessions: 17,
          }),
        ],
      }),
    );
  });

  it("keeps duplicate normalized paths unknown when any contributing metric is null", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      rows: [
        {
          date: "2026-07-07",
          engagedSessions: null,
          keyEvents: 2,
          landingPage: "https://example.com/docs",
          sessions: 8,
        },
        {
          date: "2026-07-07",
          engagedSessions: 3,
          keyEvents: null,
          landingPage: "/docs",
          sessions: 9,
        },
        {
          date: "2026-07-07",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "https://example.com/nulls",
          sessions: 4,
        },
        {
          date: "2026-07-07",
          engagedSessions: null,
          keyEvents: null,
          landingPage: "/nulls",
          sessions: 5,
        },
        {
          date: "2026-07-07",
          engagedSessions: 4,
          keyEvents: 1,
          landingPage: "https://example.com/metrics",
          sessions: 6,
        },
        {
          date: "2026-07-07",
          engagedSessions: 6,
          keyEvents: 2,
          landingPage: "/metrics",
          sessions: 7,
        },
      ],
    });

    await syncOrganicSessionsRange({
      credentials,
      end: "2026-07-07",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });

    expect(mocks.prisma.organicSessionsPageDaily.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            engagedSessions: null,
            keyEvents: null,
            path: "/docs",
            sessions: 17,
          }),
          expect.objectContaining({
            engagedSessions: null,
            keyEvents: null,
            path: "/nulls",
            sessions: 9,
          }),
          expect.objectContaining({
            engagedSessions: 10,
            keyEvents: 3,
            path: "/metrics",
            sessions: 13,
          }),
        ],
      }),
    );
  });

  it("still records an empty first-time import", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      rows: [],
    });
    mocks.prisma.organicSessionsPageDaily.count.mockResolvedValue(0);

    await syncOrganicSessionsRange({
      credentials,
      end: "2026-07-07",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });

    expect(mocks.prisma.organicSessionsPageDaily.count).toHaveBeenCalledWith({
      where: {
        date: new Date("2026-07-07T00:00:00.000Z"),
        projectId: "project_1",
        property: "123456789",
      },
    });
    expect(mocks.prisma.organicSessionsDaily.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sessions: 12 }),
    });
    expect(mocks.prisma.organicSessionsPageDaily.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.provenance).toHaveBeenCalledTimes(2);
  });

  it("keeps stored pages when an ordinary trailing day returns no landing pages", async () => {
    mocks.fetchPages.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      rows: [],
    });
    mocks.prisma.organicSessionsPageDaily.count.mockResolvedValue(1);

    await syncOrganicSessionsRange({
      credentials,
      end: "2026-07-07",
      projectId: "project_1",
      property: "123456789",
      start: "2026-07-07",
    });

    expect(mocks.prisma.organicSessionsPageDaily.deleteMany).not.toHaveBeenCalled();
    expect(mocks.prisma.organicSessionsDaily.deleteMany).not.toHaveBeenCalled();
    expect(mocks.provenance).not.toHaveBeenCalled();
    expect(mocks.prisma.organicSessionsPageDaily.count).toHaveBeenCalledWith({
      where: {
        date: new Date("2026-07-07T00:00:00.000Z"),
        projectId: "project_1",
        property: "123456789",
      },
    });
  });
});
