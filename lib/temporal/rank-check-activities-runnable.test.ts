import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOMATIC_EXECUTION_DISABLED_FAILURE,
  runRankCheckActivity,
} from "./rank-check-activities";

const mocks = vi.hoisted(() => ({
  prisma: {
    $executeRaw: vi.fn(),
    keyword: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    rankCheck: { updateMany: vi.fn() },
    rankCheckRunItem: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
  runKeywordCheckWithFallback: vi.fn(),
}));

vi.mock("../db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../rank-check/fallback", async () => {
  const actual =
    await vi.importActual<typeof import("../rank-check/fallback")>("../rank-check/fallback");
  return { ...actual, runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback };
});
/** Every automatic source, paired with the scheduler mode that admits it. */
const AUTOMATIC = [
  ["legacy", "legacy"],
  ["dispatcher", "dispatcher"],
] as const;

const ACTIVE_LOCATION = "location_active";

function keywordRow(overrides: { archivedAt?: Date | null; locationId?: string } = {}) {
  return {
    archivedAt: null,
    locationId: ACTIVE_LOCATION,
    projectId: "project_1",
    ...overrides,
  };
}

function checkInput(source: "dispatcher" | "legacy" | "manual") {
  return { keywordId: "keyword_1", rankCheckId: "rank_running_1", source };
}

describe("runRankCheckActivity runnable gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
    mocks.prisma.$executeRaw.mockResolvedValue(1);
    mocks.prisma.keyword.findUnique.mockResolvedValue(keywordRow());
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: ACTIVE_LOCATION }]);
    mocks.runKeywordCheckWithFallback.mockResolvedValue({
      attempts: [],
      provider: "primary",
      rankCheck: {
        checkedAt: new Date("2026-09-02T08:00:00.000Z"),
        costCents: 25,
        id: "rank_running_1",
        keywordId: "keyword_1",
        position: 3,
        rankingUrl: null,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(AUTOMATIC)(
    "refuses %s work for a paused market before any paid call",
    async (source, mode) => {
      vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
      mocks.prisma.projectMarket.findMany.mockResolvedValue([]);

      await expect(runRankCheckActivity(checkInput(source))).rejects.toMatchObject({
        message: "market_inactive",
        nonRetryable: true,
        type: AUTOMATIC_EXECUTION_DISABLED_FAILURE,
      });

      expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled();
      expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
    },
  );

  it.each(AUTOMATIC)("refuses %s work whose market row was removed", async (source, mode) => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_other" }]);

    await expect(runRankCheckActivity(checkInput(source))).rejects.toMatchObject({
      message: "market_inactive",
      nonRetryable: true,
      type: AUTOMATIC_EXECUTION_DISABLED_FAILURE,
    });

    expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });

  it.each(AUTOMATIC)("refuses %s work for an archived keyword", async (source, mode) => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);
    mocks.prisma.keyword.findUnique.mockResolvedValue(
      keywordRow({ archivedAt: new Date("2026-09-01T05:00:00.000Z") }),
    );

    await expect(runRankCheckActivity(checkInput(source))).rejects.toMatchObject({
      message: "keyword_archived",
      nonRetryable: true,
      type: AUTOMATIC_EXECUTION_DISABLED_FAILURE,
    });

    expect(mocks.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.runKeywordCheckWithFallback).not.toHaveBeenCalled();
  });

  it.each(AUTOMATIC)("leaves %s work for a runnable keyword unchanged", async (source, mode) => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", mode);

    await expect(runRankCheckActivity(checkInput(source))).resolves.toMatchObject({
      costCents: 25,
      position: 3,
      rankCheckId: "rank_running_1",
    });

    expect(mocks.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.runKeywordCheckWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ keywordId: "keyword_1", source: "worker" }),
    );
  });

  it("reads the active market registry for the keyword's own project", async () => {
    await runRankCheckActivity(checkInput("legacy"));

    expect(mocks.prisma.keyword.findUnique).toHaveBeenCalledWith({
      select: { archivedAt: true, locationId: true, projectId: true },
      where: { id: "keyword_1" },
    });
    expect(mocks.prisma.projectMarket.findMany).toHaveBeenCalledWith({
      select: { locationId: true },
      where: { projectId: "project_1", status: "active" },
    });
  });

  // The decision this branch takes: a manual check is a person asking for this one check with the
  // operator present, and every manual surface already applies the same predicate upstream. A
  // paused market is a policy for unattended spending, so it does not veto a deliberate one-off.
  it("still runs a manual check for a keyword whose market is paused", async () => {
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);
    mocks.prisma.keyword.findUnique.mockResolvedValue(
      keywordRow({ archivedAt: new Date("2026-09-01T05:00:00.000Z") }),
    );

    await expect(runRankCheckActivity(checkInput("manual"))).resolves.toMatchObject({
      rankCheckId: "rank_running_1",
    });

    expect(mocks.prisma.keyword.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.projectMarket.findMany).not.toHaveBeenCalled();
    expect(mocks.runKeywordCheckWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ source: "app" }),
    );
  });

  it("does not rename a missing keyword into an unrunnable refusal", async () => {
    mocks.prisma.keyword.findUnique.mockResolvedValue(null);

    await expect(runRankCheckActivity(checkInput("legacy"))).resolves.toMatchObject({
      rankCheckId: "rank_running_1",
    });

    expect(mocks.prisma.projectMarket.findMany).not.toHaveBeenCalled();
    expect(mocks.runKeywordCheckWithFallback).toHaveBeenCalledTimes(1);
  });

  it("keeps the mode refusal ahead of the runnable read", async () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");

    await expect(runRankCheckActivity(checkInput("legacy"))).rejects.toMatchObject({
      message: "automatic_legacy_disabled_in_cutover",
      nonRetryable: true,
      type: AUTOMATIC_EXECUTION_DISABLED_FAILURE,
    });

    expect(mocks.prisma.keyword.findUnique).not.toHaveBeenCalled();
  });
});
