import type { ObservationRunInput } from "@/lib/observation/types";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  persistFailedRankCheck,
  persistRankCheck,
  RankCheckClosedBeforePersistenceError,
} from "./runner";

const mocks = vi.hoisted(() => ({
  enqueueAlertDeliveries: vi.fn(() => Promise.resolve()),
  evaluateKeywordAlerts: vi.fn((): Promise<{ id: string }[]> => Promise.resolve([])),
  notifyRankCheckCompleted: vi.fn(() => Promise.resolve()),
  notifyRankCheckFailed: vi.fn(() => Promise.resolve()),
  publishOperationChanged: vi.fn(() => Promise.resolve()),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
    keywordSchedule: { update: vi.fn() },
    observationItem: { createMany: vi.fn() },
    observationRun: { create: vi.fn() },
    projectDefaults: { update: vi.fn() },
    providerConnection: { update: vi.fn() },
    providerCostEntry: { createMany: vi.fn() },
    rankCheck: { create: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
    rankCheckRun: { update: vi.fn() },
    rankCheckRunItem: { findUnique: vi.fn(), updateMany: vi.fn() },
    signal: { create: vi.fn() },
  },
}));

vi.mock("@/lib/alerts/evaluate", () => ({
  evaluateKeywordAlerts: mocks.evaluateKeywordAlerts,
}));
vi.mock("@/lib/temporal/alert-delivery-client", () => ({
  enqueueAlertDeliveries: mocks.enqueueAlertDeliveries,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckCompleted: mocks.notifyRankCheckCompleted,
  notifyRankCheckFailed: mocks.notifyRankCheckFailed,
}));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));

const checkedAt = new Date("2026-01-01T06:00:00.000Z");
const KEYWORD_PUBLIC_ID = "kw_abcdefghijklmnopqrstuvwx";
const RANK_CHECK_PUBLIC_ID = "check_abcdefghijklmnopqrstuvwx";

describe("rank-check persistence update path", () => {
  beforeEach(() => {
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.publishOperationChanged.mockResolvedValue(undefined);
    mocks.prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheckRun.update.mockResolvedValue({ projectId: "project_1" });
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue(null);
    mocks.prisma.rankCheck.findUniqueOrThrow.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, publicId: RANK_CHECK_PUBLIC_ID, raw: null, trigger: null }),
    );
    mocks.prisma.signal.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "signal_1", ...data }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persists completion, schedule state, provider usage, and audit atomically", async () => {
    let transactionResolved = false;
    const tx = {
      $queryRaw: vi.fn(),
      auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit_1" })) },
      keywordSchedule: { update: vi.fn(() => Promise.resolve({})) },
      projectDefaults: { update: vi.fn() },
      providerConnection: { update: vi.fn(() => Promise.resolve({})) },
      providerCostEntry: { createMany: vi.fn(() => Promise.resolve({ count: 1 })) },
      rankCheck: {
        create: vi.fn(),
        findUniqueOrThrow: vi.fn(({ where }) =>
          Promise.resolve({
            id: where.id,
            publicId: RANK_CHECK_PUBLIC_ID,
            raw: null,
            trigger: null,
          }),
        ),
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      },
      rankCheckRun: { update: vi.fn() },
      rankCheckRunItem: { findUnique: vi.fn(async () => null), updateMany: vi.fn() },
      signal: { create: vi.fn(({ data }) => Promise.resolve({ id: "signal_1", ...data })) },
    };
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      transactionResolved = true;
      return result;
    });
    mocks.publishOperationChanged.mockImplementation(async () => {
      expect(transactionResolved).toBe(true);
      throw new Error("Redis unavailable");
    });

    await persistRankCheck(
      {
        connectionId: "connection_1",
        existingRankCheckId: "rank_running_1",
        hasDefaults: false,
        hasSchedule: true,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        providerCostCents: 0.04,
        rankCheck: {
          billingUnits: 4,
          checkedAt,
          costCents: 0.06,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "dataforseo",
          rankingUrl: "https://example.com/rank-tracker",
          raw: null,
          requestedDepth: 20,
        },
        scheduleUpdate: {
          lastCheckedAt: checkedAt,
          nextCheckAt: new Date("2026-01-02T06:00:00.000Z"),
        },
      },
    );

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.publishOperationChanged).toHaveBeenCalledWith({ projectId: "project_1" });
    expect(tx.rankCheck.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptCount: 1,
        billingUnits: 4,
        costCents: 0.06,
        degradedToCountry: false,
        estimatedCostCents: null,
        finishedAt: expect.any(Date),
        requestedDepth: 20,
        status: "completed",
        viaFallback: false,
      }),
      where: { id: "rank_running_1", status: "running" },
    });
    expect(tx.keywordSchedule.update).toHaveBeenCalledWith({
      data: {
        lastCheckedAt: checkedAt,
        nextCheckAt: new Date("2026-01-02T06:00:00.000Z"),
      },
      where: { keywordId: "keyword_1" },
    });
    expect(tx.providerConnection.update).toHaveBeenCalledWith({
      data: { lastUsedAt: checkedAt },
      where: { id: "connection_1" },
    });
    expect(tx.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          cached: false,
          connectionId: "connection_1",
          costCents: 0.04,
          failed: false,
          feature: "rank_check",
          keywordId: "keyword_1",
          provider: "dataforseo",
          providerRequestId: undefined,
          projectId: "project_1",
          usageQuantity: 4,
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "rank_check.completed",
          actorId: null,
          before: { status: "running" },
          projectId: "project_1",
          targetId: RANK_CHECK_PUBLIC_ID,
          targetType: "rank_check",
        }),
      }),
    );
    expect(tx.signal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        happenedAt: checkedAt,
        keywordId: "keyword_1",
        payload: {
          after: 4,
          before: 8,
          delta: 4,
          rankCheckId: "rank_running_1",
          requestedDepth: 20,
        },
        projectId: "project_1",
        severity: "info",
        source: "rank_tracker",
        type: SIGNAL_TYPES.rankingChanged,
        url: "https://example.com/rank-tracker",
      }),
    });
  });

  it("persists observations inside the rank-check transaction", async () => {
    const tx = {
      auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit_1" })) },
      keywordSchedule: { update: vi.fn() },
      observationItem: { createMany: vi.fn(() => Promise.resolve({ count: 1 })) },
      observationRun: { create: vi.fn(() => Promise.resolve({ id: "observation_run_1" })) },
      projectDefaults: { update: vi.fn() },
      providerConnection: { update: vi.fn() },
      providerCostEntry: { createMany: vi.fn() },
      rankCheck: {
        create: vi.fn(({ data }) =>
          Promise.resolve({ id: "rank_new_1", publicId: RANK_CHECK_PUBLIC_ID, ...data }),
        ),
        findUniqueOrThrow: vi.fn(),
        updateMany: vi.fn(),
      },
      signal: { create: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    const observation: ObservationRunInput = {
      provider: "example-provider",
      surface: "web_serp",
      engine: "google",
      requestPolicy: { depth: 20, stopOnMatch: true, forcedAiOverview: false },
      completeness: "complete",
      configuredScope: { location: "US", language: "en", device: "desktop" },
      executedAt: checkedAt,
      items: [{ resultKind: "local_pack", domain: "example.com", rawFragment: { item: 1 } }],
    };

    await persistRankCheck(
      {
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          observation,
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "example-provider",
          rankingUrl: "https://example.com/rank-tracker",
          raw: null,
          requestedDepth: 20,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(tx.observationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project_1",
        rankCheckId: "rank_new_1",
      }),
    });
  });

  it("persists observations for an already running rank check", async () => {
    const tx = {
      auditLog: { create: vi.fn(() => Promise.resolve({ id: "audit_1" })) },
      keywordSchedule: { update: vi.fn() },
      observationItem: { createMany: vi.fn(() => Promise.resolve({ count: 1 })) },
      observationRun: { create: vi.fn(() => Promise.resolve({ id: "observation_run_1" })) },
      projectDefaults: { update: vi.fn() },
      providerConnection: { update: vi.fn() },
      providerCostEntry: { createMany: vi.fn() },
      rankCheck: {
        create: vi.fn(),
        findUniqueOrThrow: vi.fn(({ where }) =>
          Promise.resolve({
            id: where.id,
            publicId: RANK_CHECK_PUBLIC_ID,
            raw: null,
            trigger: null,
          }),
        ),
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      },
      signal: { create: vi.fn(({ data }) => Promise.resolve({ id: "signal_1", ...data })) },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    const observation: ObservationRunInput = {
      provider: "example-provider",
      surface: "web_serp",
      engine: "google",
      requestPolicy: { depth: 20, stopOnMatch: false, forcedAiOverview: false },
      completeness: "unknown",
      configuredScope: { location: "US", language: "en", device: "desktop" },
      executedAt: checkedAt,
      items: [{ resultKind: "ai_overview", rawFragment: { item: 1 } }],
    };

    await persistRankCheck(
      {
        existingRankCheckId: "rank_running_1",
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          observation,
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "example-provider",
          rankingUrl: null,
          raw: null,
          requestedDepth: 20,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(tx.rankCheck.create).not.toHaveBeenCalled();
    expect(tx.observationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        completeness: "unknown",
        projectId: "project_1",
        rankCheckId: "rank_running_1",
      }),
    });
    expect(tx.observationItem.createMany).toHaveBeenCalledOnce();
  });

  it("does not create an observation when none was captured", async () => {
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_new_1", publicId: RANK_CHECK_PUBLIC_ID, ...data }),
    );

    await persistRankCheck(
      {
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "example-provider",
          rankingUrl: null,
          raw: null,
          requestedDepth: 20,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(mocks.prisma.observationRun.create).not.toHaveBeenCalled();
  });

  it("checks persistence ownership before the canonical spend write", async () => {
    const persistenceGuard = vi.fn(() =>
      Promise.reject(new RankCheckClosedBeforePersistenceError()),
    );

    await expect(
      persistFailedRankCheck({
        error: "terminal provider failure",
        existingRankCheckId: "rank_running_1",
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        persistenceGuard,
        projectId: "project_1",
        provider: "dataforseo",
        providerCostCents: 2.4,
      }),
    ).rejects.toBeInstanceOf(RankCheckClosedBeforePersistenceError);

    expect(persistenceGuard).toHaveBeenCalledOnce();
    expect(mocks.prisma.rankCheck.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.providerCostEntry.createMany).not.toHaveBeenCalled();
  });

  it("updates an existing running row when a rank check id is supplied", async () => {
    const rankCheck = await persistRankCheck(
      {
        existingRankCheckId: "rank_running_1",
        hasDefaults: false,
        hasSchedule: false,
        expectedUrlAtCheck: "https://example.com/recorded",
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        keywordTargetUrl: "https://example.com/rank-tracker",
        previousRankingUrl: "https://example.com/old-page",
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0.06,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 4,
          provider: "dataforseo",
          rankingUrl: "https://example.com/rank-tracker",
          raw: null,
          requestedDepth: 50,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(mocks.prisma.rankCheck.create).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptCount: 1,
        degradedToCountry: false,
        error: null,
        errorCode: null,
        expectedUrlAtCheck: "https://example.com/recorded",
        position: 4,
        requestedDepth: 50,
        status: "completed",
        viaFallback: false,
      }),
      where: { id: "rank_running_1", status: "running" },
    });
    expect(mocks.notifyRankCheckCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ rankCheckId: "rank_running_1" }),
    );
    expect(mocks.prisma.signal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: {
          after: "https://example.com/rank-tracker",
          before: "https://example.com/old-page",
          matchesTargetUrl: false,
          requestedDepth: 50,
        },
        type: SIGNAL_TYPES.rankingUrlChanged,
      }),
    });
    expect(rankCheck.id).toBe("rank_running_1");
  });

  it("transitions a linked queued task completion and increments its run", async () => {
    mocks.prisma.rankCheck.findUniqueOrThrow.mockResolvedValue({
      costCents: 0.06,
      id: "rank_running_1",
      publicId: RANK_CHECK_PUBLIC_ID,
      raw: null,
      trigger: "scheduled",
    });
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue({ runId: "run_1" });
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 1 });

    await persistRankCheck(
      {
        existingRankCheckId: "rank_running_1",
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0.06,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "dataforseo",
          rankingUrl: null,
          raw: null,
          requestedDepth: 20,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: { actualCostCents: 0.06, finishedAt: expect.any(Date), status: "completed" },
      where: { rankCheckId: "rank_running_1", status: { in: ["queued", "running"] } },
    });
    expect(mocks.prisma.rankCheckRun.update).toHaveBeenCalledWith({
      data: { completedCount: { increment: 1 } },
      where: { id: "run_1" },
    });
  });

  it("clears errorCode on the completed create path after a transient retry", async () => {
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_new_1", publicId: RANK_CHECK_PUBLIC_ID, ...data }),
    );

    await persistRankCheck(
      {
        expectedUrlAtCheck: "https://example.com/recorded",
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0.06,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "primary",
          rankingUrl: null,
          raw: null,
          requestedDepth: 20,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(mocks.prisma.rankCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: null,
        errorCode: null,
        expectedUrlAtCheck: "https://example.com/recorded",
        publicId: expect.stringMatching(/^check_/),
        status: "completed",
      }),
    });
  });

  it("enqueues queued delivery for evaluated alerts", async () => {
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", publicId: RANK_CHECK_PUBLIC_ID, ...data }),
    );
    mocks.evaluateKeywordAlerts.mockResolvedValue([{ id: "alert_1" }, { id: "alert_2" }]);

    await persistRankCheck(
      {
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0.06,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "dataforseo",
          rankingUrl: null,
          raw: null,
          requestedDepth: 20,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(mocks.enqueueAlertDeliveries).toHaveBeenCalledWith(["alert_1", "alert_2"]);
  });

  it("allows acceptance callers to replace only the queue boundary", async () => {
    const enqueueDeliveries = vi.fn(() => Promise.resolve());
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", publicId: RANK_CHECK_PUBLIC_ID, ...data }),
    );
    mocks.evaluateKeywordAlerts.mockResolvedValue([{ id: "alert_1" }]);

    await persistRankCheck(
      {
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "fake",
          rankingUrl: null,
          raw: null,
          requestedDepth: 20,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
      { enqueueDeliveries },
    );

    expect(enqueueDeliveries).toHaveBeenCalledWith(["alert_1"]);
    expect(mocks.enqueueAlertDeliveries).not.toHaveBeenCalled();
  });

  it("survives an enqueue failure", async () => {
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", publicId: RANK_CHECK_PUBLIC_ID, ...data }),
    );
    mocks.evaluateKeywordAlerts.mockResolvedValue([{ id: "alert_1" }]);
    mocks.enqueueAlertDeliveries.mockRejectedValueOnce(new Error("Temporal unavailable"));

    await expect(
      persistRankCheck(
        {
          hasDefaults: false,
          hasSchedule: false,
          keywordId: "keyword_1",
          keywordPublicId: KEYWORD_PUBLIC_ID,
          projectId: "project_1",
        },
        {
          comparisonAllowed: true,
          rankCheck: {
            billingUnits: null,
            checkedAt,
            costCents: 0.06,
            estimatedCostCents: null,
            keywordId: "keyword_1",
            normalizationVersion: "v1",
            organicRanks: null,
            position: 4,
            previousPosition: 8,
            provider: "dataforseo",
            rankingUrl: null,
            raw: null,
            requestedDepth: 20,
          },
          scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
        },
      ),
    ).resolves.toMatchObject({ id: "rank_1" });
  });

  it("does not emit signals when completed rank-check facts are unchanged", async () => {
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rank_1", publicId: RANK_CHECK_PUBLIC_ID, ...data }),
    );

    await persistRankCheck(
      {
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        keywordTargetUrl: "https://example.com/rank-tracker",
        previousRankingUrl: "https://example.com/rank-tracker",
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0.06,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 4,
          provider: "dataforseo",
          rankingUrl: "https://example.com/rank-tracker",
          raw: null,
          requestedDepth: 100,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(mocks.prisma.signal.create).not.toHaveBeenCalled();
  });

  it.each([
    ["scheduled", "deferred"],
    ["manual", "immediate"],
    [null, "immediate"],
  ])("passes %s rank checks through %s alert delivery", async (trigger, deliveryMode) => {
    mocks.prisma.rankCheck.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: `rank_${trigger ?? "direct"}`,
        publicId: RANK_CHECK_PUBLIC_ID,
        ...data,
        trigger,
      }),
    );

    await persistRankCheck(
      {
        hasDefaults: false,
        hasSchedule: false,
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
      },
      {
        comparisonAllowed: true,
        rankCheck: {
          billingUnits: null,
          checkedAt,
          costCents: 0.06,
          estimatedCostCents: null,
          keywordId: "keyword_1",
          normalizationVersion: "v1",
          organicRanks: null,
          position: 4,
          previousPosition: 8,
          provider: "dataforseo",
          rankingUrl: null,
          raw: null,
          requestedDepth: 10,
        },
        scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
      },
    );

    expect(mocks.evaluateKeywordAlerts).toHaveBeenCalledWith(
      "keyword_1",
      expect.any(Object),
      expect.any(Object),
      { comparisonAllowed: true, deliveryMode },
    );
  });

  it("marks an existing running row failed when a rank check id is supplied", async () => {
    const rankCheck = await persistFailedRankCheck({
      checkedAt,
      errorCode: "provider_billing",
      error: "provider unavailable",
      expectedUrlAtCheck: "https://example.com/failed-recorded",
      existingRankCheckId: "rank_running_1",
      keywordId: "keyword_1",
      keywordPublicId: KEYWORD_PUBLIC_ID,
      keywordText: "rank tracker",
      projectDomain: "example.com",
      projectId: "project_1",
      provider: "serpapi",
      requestedDepth: 10,
    });

    expect(mocks.prisma.rankCheck.create).not.toHaveBeenCalled();
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptCount: 0,
        degradedToCountry: false,
        error: "provider unavailable",
        errorCode: "provider_billing",
        expectedUrlAtCheck: "https://example.com/failed-recorded",
        finishedAt: expect.any(Date),
        requestedDepth: 10,
        status: "failed",
        viaFallback: false,
      }),
      where: { id: "rank_running_1", status: "running" },
    });
    expect(mocks.notifyRankCheckFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "provider_billing",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        message: "provider unavailable",
        rankCheckId: RANK_CHECK_PUBLIC_ID,
      }),
    );
    expect(rankCheck.id).toBe("rank_running_1");
  });

  it("transitions a linked queued task failure and increments its run", async () => {
    mocks.prisma.rankCheck.findUniqueOrThrow.mockResolvedValue({
      costCents: 0,
      id: "rank_running_1",
      publicId: RANK_CHECK_PUBLIC_ID,
      raw: null,
      trigger: "scheduled",
    });
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue({ runId: "run_1" });
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 1 });

    await persistFailedRankCheck({
      checkedAt,
      error: "provider unavailable",
      existingRankCheckId: "rank_running_1",
      keywordId: "keyword_1",
      keywordPublicId: KEYWORD_PUBLIC_ID,
      projectId: "project_1",
      provider: "dataforseo",
    });

    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: { actualCostCents: 0, finishedAt: expect.any(Date), status: "failed" },
      where: { rankCheckId: "rank_running_1", status: { in: ["queued", "running"] } },
    });
    expect(mocks.prisma.rankCheckRun.update).toHaveBeenCalledWith({
      data: { failedCount: { increment: 1 } },
      where: { id: "run_1" },
    });
  });

  it("persists failures and audit atomically", async () => {
    const auditCreate = vi.fn((input: unknown) => Promise.resolve({ id: "audit_1", input }));
    const tx = {
      $queryRaw: vi.fn(),
      auditLog: { create: auditCreate },
      providerCostEntry: { createMany: vi.fn(() => Promise.resolve({ count: 1 })) },
      rankCheck: {
        findUniqueOrThrow: vi.fn(({ where }) =>
          Promise.resolve({
            id: where.id,
            publicId: RANK_CHECK_PUBLIC_ID,
            raw: null,
            trigger: null,
          }),
        ),
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      },
      rankCheckRun: { update: vi.fn() },
      rankCheckRunItem: { findUnique: vi.fn(async () => null), updateMany: vi.fn() },
      signal: { create: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));

    await persistFailedRankCheck({
      attempts: [
        { message: "primary timeout", provider: "dataforseo" },
        { message: "backup parse failed", provider: "serpapi" },
      ],
      checkedAt,
      errorCode: "provider_billing",
      error: "provider unavailable",
      existingRankCheckId: "rank_running_1",
      connectionId: "connection_1",
      keywordId: "keyword_1",
      keywordPublicId: KEYWORD_PUBLIC_ID,
      projectId: "project_1",
      provider: "serpapi",
      providerCostCents: 1.2,
      requestedDepth: 50,
    });

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.rankCheck.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptCount: 2,
        attempts: [
          { message: "primary timeout", provider: "dataforseo" },
          { message: "backup parse failed", provider: "serpapi" },
        ],
        errorCode: "provider_billing",
        degradedToCountry: false,
        error: "provider unavailable",
        costCents: 1.2,
        estimatedCostCents: null,
        finishedAt: expect.any(Date),
        requestedDepth: 50,
        status: "failed",
        viaFallback: false,
      }),
      where: { id: "rank_running_1", status: "running" },
    });
    expect(tx.providerCostEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          cached: false,
          connectionId: "connection_1",
          costCents: 1.2,
          failed: true,
          feature: "rank_check",
          keywordId: "keyword_1",
          provider: "serpapi",
          providerRequestId: undefined,
          projectId: "project_1",
          usageQuantity: undefined,
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "rank_check.failed",
          actorId: null,
          before: { status: "running" },
          after: expect.objectContaining({
            attemptCount: 2,
            error: "provider unavailable",
          }),
          projectId: "project_1",
          targetId: RANK_CHECK_PUBLIC_ID,
          targetType: "rank_check",
        }),
      }),
    );
    const auditInput = auditCreate.mock.calls[0]?.[0] as { data: { after?: unknown } } | undefined;
    expect(auditInput?.data.after).not.toHaveProperty("attempts");
    expect(tx.signal.create).not.toHaveBeenCalled();
  });

  it("does not complete a row the stale sweep already failed", async () => {
    const staleFailedRow = { status: "failed" };
    mocks.prisma.rankCheck.updateMany.mockImplementation(({ data, where }) => {
      if (where.status === staleFailedRow.status) {
        staleFailedRow.status = data.status;
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    });

    await expect(
      persistRankCheck(
        {
          existingRankCheckId: "rank_stale_1",
          hasDefaults: false,
          hasSchedule: false,
          keywordId: "keyword_1",
          keywordPublicId: KEYWORD_PUBLIC_ID,
          projectId: "project_1",
        },
        {
          comparisonAllowed: true,
          rankCheck: {
            billingUnits: null,
            checkedAt,
            costCents: 0,
            estimatedCostCents: null,
            keywordId: "keyword_1",
            normalizationVersion: "v1",
            organicRanks: null,
            position: 4,
            previousPosition: null,
            provider: "local-sequence",
            rankingUrl: null,
            raw: null,
            requestedDepth: 20,
          },
          scheduleUpdate: { lastCheckedAt: checkedAt, nextCheckAt: null },
        },
      ),
    ).rejects.toBeInstanceOf(RankCheckClosedBeforePersistenceError);

    expect(staleFailedRow.status).toBe("failed");
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rank_stale_1", status: "running" } }),
    );
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
    expect(mocks.notifyRankCheckCompleted).not.toHaveBeenCalled();
  });

  it("does not overwrite a row the stale sweep already failed with a late failure", async () => {
    const staleFailedRow = { status: "failed" };
    mocks.prisma.rankCheck.updateMany.mockImplementation(({ data, where }) => {
      if (where.status === staleFailedRow.status) {
        staleFailedRow.status = data.status;
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    });

    await expect(
      persistFailedRankCheck({
        error: "provider unavailable",
        existingRankCheckId: "rank_stale_1",
        keywordId: "keyword_1",
        keywordPublicId: KEYWORD_PUBLIC_ID,
        projectId: "project_1",
        provider: "local-sequence",
      }),
    ).rejects.toBeInstanceOf(RankCheckClosedBeforePersistenceError);

    expect(staleFailedRow.status).toBe("failed");
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rank_stale_1", status: "running" } }),
    );
    expect(mocks.prisma.auditLog.create).not.toHaveBeenCalled();
    expect(mocks.notifyRankCheckFailed).not.toHaveBeenCalled();
  });

  it("records native provider usage when monetary cost is zero", async () => {
    const { writeRankCheckProviderCostEntry } = await import("./provider-cost-persistence");
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { providerCostEntry: { create: vi.fn(), createMany } };

    await writeRankCheckProviderCostEntry(tx as never, {
      connectionId: "connection_1",
      costCents: 0,
      failed: false,
      provider: "serpapi",
      projectId: "project_1",
      usage: {
        context: {
          correlationId: "00000000-0000-4000-8000-000000000000",
          feature: "rank_check",
          projectId: "project_1",
          source: "worker",
          trigger: "scheduled",
        },
        tag: "app=bisibility;stage=test;src=worker;trg=scheduled;f=rank_check;p=project_1;c=00000000-0000-4000-8000-000000000000",
      },
      usageQuantity: 3,
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ costCents: 0, usageQuantity: 3 })],
      skipDuplicates: true,
    });
  });
});
