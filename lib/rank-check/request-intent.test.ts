import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkedAt = new Date("2026-09-04T12:00:00.000Z");
const keyword = {
  id: "keyword_1",
  projectId: "project_1",
  projectIsSample: false,
  projectPublicId: "prj_abcdefghijklmnopqrstuvwx",
  publicId: "kw_abcdefghijklmnopqrstuvwx",
  text: "rank tracker",
};
const run = {
  estimatedCostCents: 1,
  keywordCount: 1,
  publicId: "rcr_abcdefghijklmnopqrstuvwx",
  status: "queued" as const,
  targetCount: 1,
};
const rankCheck = {
  attempts: [],
  checkedAt,
  costCents: 1,
  error: null,
  id: "rank_check_1",
  keyword: { projectId: "project_1", publicId: keyword.publicId },
  position: 3,
  previousPosition: null,
  provider: "serpapi",
  publicId: "check_abcdefghijklmnopqrstuvwx",
  rankingUrl: null,
  raw: null,
  requestedDepth: 100,
  status: "completed",
  trigger: "manual",
};
const POLAND_LOCATION = {
  gl: "pl",
  hl: "pl",
  kind: "country",
  primaryGeoCode: null,
  primaryGeoName: "Poland",
  secondaryGeoName: "Poland",
};

const mocks = vi.hoisted(() => ({
  connectionConnect: vi.fn(),
  consumeProviderLimit: vi.fn(),
  enqueueAlertDeliveries: vi.fn(),
  evaluateKeywordAlerts: vi.fn(),
  findComparablePredecessor: vi.fn(),
  getActionActor: vi.fn(),
  launchSingleRankCheckRun: vi.fn(),
  loadProviderRateContext: vi.fn(),
  loadProviderRateContexts: vi.fn(),
  notifyRankCheckCompleted: vi.fn(),
  provider: { fetchRank: vi.fn(), id: "serpapi" },
  publishOperationChanged: vi.fn(),
  revalidateRankCheckViews: vi.fn(),
  requireKeywordScope: vi.fn(),
  writeAudit: vi.fn(),
  prisma: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn(), findUnique: vi.fn() },
    keywordSchedule: { update: vi.fn() },
    project: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    projectDefaults: { update: vi.fn() },
    providerConnection: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    providerCostEntry: { createMany: vi.fn() },
    rankCheck: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    rankCheckRun: { update: vi.fn(), updateMany: vi.fn() },
    rankCheckRunItem: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (input: unknown) => input,
  requireKeywordScope: mocks.requireKeywordScope,
  revalidateRankCheckViews: mocks.revalidateRankCheckViews,
}));
vi.mock("@/lib/alerts/evaluate", () => ({ evaluateKeywordAlerts: mocks.evaluateKeywordAlerts }));
vi.mock("@/lib/auth/audit", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/audit")>("@/lib/auth/audit")),
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/events", () => ({
  notifyRankCheckCompleted: mocks.notifyRankCheckCompleted,
}));
vi.mock("@/lib/notifications/realtime", () => ({
  publishOperationChanged: mocks.publishOperationChanged,
}));
vi.mock("@/lib/provider-rates/connection-context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/provider-rates/connection-context")>(
    "@/lib/provider-rates/connection-context",
  )),
  loadProviderRateContext: mocks.loadProviderRateContext,
  loadProviderRateContexts: mocks.loadProviderRateContexts,
}));
vi.mock("@/lib/provider-usage/tag", async () => ({
  ...(await vi.importActual<typeof import("@/lib/provider-usage/tag")>("@/lib/provider-usage/tag")),
  createProviderRequestAttribution: vi.fn(async (context) => ({ context, tag: "test" })),
}));
vi.mock("@/lib/providers/rate-limit", async () => ({
  ...(await vi.importActual<typeof import("@/lib/providers/rate-limit")>(
    "@/lib/providers/rate-limit",
  )),
  consumeProviderLimit: mocks.consumeProviderLimit,
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => ({ apiKey: "test" }),
}));
vi.mock("@/lib/providers/registry", async () => ({
  ...(await vi.importActual<typeof import("@/lib/providers/registry")>("@/lib/providers/registry")),
  getSerpProvider: () => mocks.provider,
}));
vi.mock("@/lib/rank-check/comparable-history", () => ({
  findComparablePredecessor: mocks.findComparablePredecessor,
}));
vi.mock("@/lib/rank-check/runs/launch-single", () => ({
  launchSingleRankCheckRun: mocks.launchSingleRankCheckRun,
}));
vi.mock("@/lib/temporal/alert-delivery-client", () => ({
  enqueueAlertDeliveries: mocks.enqueueAlertDeliveries,
}));
vi.mock("@temporalio/client", () => ({ Connection: { connect: mocks.connectionConnect } }));

import { errorFromUnknown } from "@/lib/api/error-mapper";
import { requestRankCheck } from "@/lib/api/rank-check-request";
import {
  ALREADY_IN_PROGRESS_REASON,
  launchRankCheckRunNothingToRun,
} from "@/lib/rank-check/runs/launch-types";
import { manualRunCheckNow } from "./manual-run";
import { KEYWORD_ARCHIVED_REASON, MARKET_INACTIVE_REASON } from "./runnable-reasons";

function context() {
  return {
    actorId: "user_1",
    auth: { project: { id: "project_1" } },
    headers: new Headers(),
    instance: "https://example.com/api/v1",
  } as never;
}

function scopedKeyword() {
  return { ...keyword, project: { domain: "example.com", isSample: false } };
}

describe("single rank-check request intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireKeywordScope.mockResolvedValue(keyword);
    mocks.launchSingleRankCheckRun.mockResolvedValue(run);
    mocks.prisma.$executeRaw.mockResolvedValue(1);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.keyword.findMany.mockResolvedValue([]);
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      ...keyword,
      _count: { rankChecks: 0 },
      archivedAt: null,
      locationId: "location_active",
      device: "desktop",
      location: "Poland",
      locationRef: POLAND_LOCATION,
      project: {
        budgetCapCents: null,
        defaults: { serpDepth: 100, serpStopOnMatch: false },
        domain: "example.com",
        providerAllocationsInitializedAt: checkedAt,
      },
      schedule: null,
      targetUrl: null,
    });
    mocks.prisma.project.findUniqueOrThrow.mockResolvedValue({
      domain: "example.com",
      id: "project_1",
      isSample: false,
    });
    mocks.prisma.project.findUnique.mockResolvedValue({
      budgetCapCents: null,
      providerAllocationsInitializedAt: checkedAt,
    });
    mocks.prisma.providerConnection.findFirst.mockResolvedValue({
      costPerCheckCents: 1,
      id: "connection_1",
      projectId: "project_1",
      provider: "serpapi",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        costPerCheckCents: 1,
        credentialsEncrypted: "ignored",
        id: "connection_1",
        provider: "serpapi",
      },
    ]);
    mocks.prisma.rankCheck.create.mockResolvedValue(rankCheck);
    mocks.prisma.rankCheck.findFirst.mockResolvedValue(null);
    mocks.prisma.rankCheck.findUnique.mockResolvedValue({ trigger: "manual" });
    mocks.prisma.rankCheck.findUniqueOrThrow.mockResolvedValue(rankCheck);
    mocks.prisma.rankCheck.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_active" }]);
    mocks.prisma.rankCheckRunItem.findFirst.mockResolvedValue({
      id: "item_1",
      keyword: { archivedAt: null, locationId: "location_active", projectId: keyword.projectId },
      run: { id: "run_1", projectId: keyword.projectId, requestedCount: 1, status: "queued" },
    });
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue({
      id: "item_1",
      keyword: { publicId: keyword.publicId },
      keywordId: keyword.id,
      rankCheck: { workflowRunId: null },
      rankCheckId: null,
      run: {
        id: "run_1",
        projectId: keyword.projectId,
        publicId: run.publicId,
        requestedCount: 1,
        status: "running",
      },
      runId: "run_1",
      status: "queued",
    });
    mocks.prisma.rankCheckRunItem.groupBy.mockResolvedValue([
      {
        _count: { _all: 1 },
        _sum: { actualCostCents: 1 },
        keywordId: keyword.id,
        status: "completed",
      },
    ]);
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheckRun.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.providerCostEntry.createMany.mockResolvedValue({ count: 1 });
    mocks.loadProviderRateContext.mockResolvedValue({ entries: [], manualAmountCents: null });
    mocks.loadProviderRateContexts.mockResolvedValue(new Map());
    mocks.consumeProviderLimit.mockResolvedValue({ accountKey: "account_1", success: true });
    mocks.enqueueAlertDeliveries.mockRejectedValue(new Error("Temporal unavailable"));
    mocks.evaluateKeywordAlerts.mockResolvedValue([{ id: "alert_1" }]);
    mocks.findComparablePredecessor.mockResolvedValue(null);
    mocks.notifyRankCheckCompleted.mockResolvedValue(undefined);
    mocks.provider.fetchRank.mockResolvedValue({
      billingUnits: 1,
      checkedAt,
      costCents: 1,
      position: 3,
      rankingUrl: null,
    });
    mocks.publishOperationChanged.mockResolvedValue(undefined);
    mocks.writeAudit.mockResolvedValue(undefined);
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["none", true],
    ["worker", false],
    ["temporal", false],
    ["legacy-auto", false],
  ] as const)("executes paid work only when SCHEDULER_DRIVER=%s", async (driver, inline) => {
    vi.stubEnv("SCHEDULER_DRIVER", driver === "legacy-auto" ? "" : driver);

    const manual = await manualRunCheckNow({ keywordId: keyword.publicId });
    const api = await requestRankCheck(context(), {}, scopedKeyword());

    expect(mocks.launchSingleRankCheckRun).toHaveBeenCalledTimes(2);
    expect(mocks.connectionConnect).not.toHaveBeenCalled();
    expect(mocks.provider.fetchRank).toHaveBeenCalledTimes(inline ? 2 : 0);
    expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledTimes(inline ? 2 : 0);
    expect(mocks.enqueueAlertDeliveries).toHaveBeenCalledTimes(inline ? 2 : 0);
    expect(manual.status).toBe(inline ? "completed" : "queued");
    expect(api.status).toBe(inline ? 201 : 202);
    if (inline) {
      expect(mocks.prisma.rankCheck.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) }),
      );
    }
  });

  // The operator is owed the cause that actually stopped the check. "Already in progress" stays the
  // answer only where a check really is in progress; the criterion that catches a change drawn too
  // broadly is that last row, not the first two.
  it.each([
    [MARKET_INACTIVE_REASON, "market_inactive"],
    [KEYWORD_ARCHIVED_REASON, "keyword_archived"],
    [ALREADY_IN_PROGRESS_REASON, "check_in_progress"],
  ] as const)("reports %s on both the REST and the manual-run path", async (reason, manualCode) => {
    const nothing = launchRankCheckRunNothingToRun(reason);
    mocks.launchSingleRankCheckRun.mockResolvedValue(nothing);

    const manual = await manualRunCheckNow({ keywordId: keyword.publicId });
    const api = await requestRankCheck(context(), {}, scopedKeyword());

    expect(manual).toEqual({ code: manualCode, message: nothing.message, status: "not_started" });
    expect(api.status).toBe(409);
    await expect(api.json()).resolves.toMatchObject({
      detail: nothing.message,
      errors: { code: reason },
      status: 409,
    });
  });

  it("answers a client error, not a 500, when the inline guard refuses the keyword", async () => {
    vi.stubEnv("SCHEDULER_DRIVER", "none");
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);

    const thrown = await requestRankCheck(context(), {}, scopedKeyword()).catch(
      (error: unknown) => error,
    );
    const response = errorFromUnknown(
      thrown,
      new Headers(),
      new URL("https://example.com/api/v1/keywords/kw_abcdefghijklmnopqrstuvwx/rank-checks"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      detail: "The market for this keyword is no longer active.",
      errors: { code: MARKET_INACTIVE_REASON },
      status: 409,
    });
    expect(mocks.provider.fetchRank).not.toHaveBeenCalled();
  });

  it("reports the inline guard's refusal as a blocked manual-run result", async () => {
    vi.stubEnv("SCHEDULER_DRIVER", "none");
    mocks.prisma.projectMarket.findMany.mockResolvedValue([]);

    await expect(manualRunCheckNow({ keywordId: keyword.publicId })).resolves.toEqual({
      code: MARKET_INACTIVE_REASON,
      message: "The market for this keyword is no longer active.",
      status: "not_started",
    });
    // The item the launch created is closed with the reason, so the keyword does not stay stuck
    // looking like a check is in flight.
    expect(mocks.prisma.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ blockedReason: "market_inactive", status: "cancelled" }),
      where: expect.objectContaining({ id: "item_1" }),
    });
    expect(mocks.provider.fetchRank).not.toHaveBeenCalled();
  });

  it.each(["sidecar", "external-cron"])(
    "propagates invalid SCHEDULER_DRIVER=%s before creating a manual run",
    async (driver) => {
      vi.stubEnv("SCHEDULER_DRIVER", driver);

      await expect(manualRunCheckNow({ keywordId: keyword.publicId })).rejects.toThrow(
        "SCHEDULER_DRIVER",
      );
      expect(mocks.launchSingleRankCheckRun).not.toHaveBeenCalled();
    },
  );

  it.each(["sidecar", "external-cron"])(
    "propagates invalid SCHEDULER_DRIVER=%s before creating an API run",
    async (driver) => {
      vi.stubEnv("SCHEDULER_DRIVER", driver);

      await expect(requestRankCheck(context(), {}, scopedKeyword())).rejects.toThrow(
        "SCHEDULER_DRIVER",
      );
      expect(mocks.launchSingleRankCheckRun).not.toHaveBeenCalled();
    },
  );
});
