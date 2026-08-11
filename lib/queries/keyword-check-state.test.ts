import { keywordCheckState } from "@/lib/queries/keyword-row";
import { getKeywordRows } from "@/lib/queries/keywords";
import { ACTIVE_QUEUED_TASK_STATES } from "@/lib/rank-check/queued-state";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchKeywordMetrics: vi.fn(),
  fetchProjectKeywordMetrics: vi.fn(),
  fetchProjectKeywordTraffic: vi.fn(),
  getKeywordTraffic: vi.fn(),
  getRequestProjectDefaults: vi.fn(),
  prisma: { keyword: { findMany: vi.fn() } },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./keyword-metrics-query", () => ({
  fetchKeywordMetrics: mocks.fetchKeywordMetrics,
  fetchProjectKeywordMetrics: mocks.fetchProjectKeywordMetrics,
}));
vi.mock("./keyword-traffic", () => ({
  fetchProjectKeywordTraffic: mocks.fetchProjectKeywordTraffic,
  getKeywordTraffic: mocks.getKeywordTraffic,
}));
vi.mock("./workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.getRequestProjectDefaults,
}));

const queued = (state: string) => [{ state }];
const rankedCheck = { position: 7, status: "completed" };

describe("keywordCheckState", () => {
  it("returns never_checked without an attempt or queued task", () => {
    expect(keywordCheckState(null, [])).toBe("never_checked");
  });

  it("returns running without an attempt when a task is queued", () => {
    expect(keywordCheckState(null, queued("prepared"))).toBe("running");
  });

  it("returns running for a ranked attempt when a task is queued", () => {
    expect(keywordCheckState(rankedCheck, queued("prepared"))).toBe("running");
  });

  it("returns ranked for a ranked completed attempt without a queued task", () => {
    expect(keywordCheckState(rankedCheck, [])).toBe("ranked");
  });

  it("returns not_ranked for a completed attempt without a position", () => {
    expect(keywordCheckState({ position: null, status: "completed" }, [])).toBe("not_ranked");
  });

  it("returns running for a running attempt", () => {
    expect(keywordCheckState({ position: null, status: "running" }, [])).toBe("running");
  });

  it("returns failed for a failed attempt", () => {
    expect(keywordCheckState({ position: null, status: "failed" }, [])).toBe("failed");
  });

  it("keeps a failed attempt ahead of a queued task", () => {
    expect(keywordCheckState({ position: null, status: "failed" }, queued("prepared"))).toBe(
      "failed",
    );
  });

  it("does not treat a completed queued task as running", () => {
    expect(keywordCheckState(null, queued("completed"))).toBe("never_checked");
  });
});

describe("getKeywordRows queued task selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProjectKeywordMetrics.mockResolvedValue(new Map());
    mocks.fetchProjectKeywordTraffic.mockResolvedValue(new Map());
    mocks.getRequestProjectDefaults.mockResolvedValue(null);
    mocks.requireReadableProject.mockResolvedValue({
      project: { domain: "example.com", id: "project_1" },
    });
  });

  it("maps a row shaped like the queued-task select as running", async () => {
    mocks.prisma.keyword.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-08-09T08:00:00.000Z"),
        device: "desktop",
        id: "keyword_1",
        intent: null,
        location: "United States",
        locationRef: {
          canonicalKey: "country:us",
          cityName: null,
          countryCode: "US",
          displayName: "United States",
          gl: "us",
          hl: "en",
          id: "location_1",
          kind: "country",
        },
        publicId: "kw_1",
        queuedRankCheckTasks: queued("prepared"),
        rankChecks: [],
        schedule: null,
        tags: [],
        targetUrl: "https://example.com/target",
        text: "rank tracker",
        topic: null,
      },
    ]);

    const [row] = await getKeywordRows("prj_1");
    const query = mocks.prisma.keyword.findMany.mock.calls[0]?.[0];

    expect(query.select.queuedRankCheckTasks).toEqual({
      select: { state: true },
      take: 1,
      where: { state: { in: ACTIVE_QUEUED_TASK_STATES } },
    });
    expect(row).toMatchObject({ checkState: "running" });
  });
});
