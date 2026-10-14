import {
  workerDefinitionQueryFixture,
  workerSourceFixture,
} from "@/lib/measurement-definitions/worker-admission.test-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareQueuedRankCheckBatch } from "./queued-prepare";

const fixture = vi.hoisted(() => {
  const item = {
    id: "item_1",
    keywordId: "keyword_1",
    runId: "run_1",
    claimAttempts: 1,
    claimExpiresAt: new Date("2026-10-11T12:05:00.000Z"),
    rankCheckId: null,
    status: "running",
  };
  const db = {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(async (_query: readonly string[]) => 1),
    $queryRaw: vi.fn(),
    project: {
      findUnique: vi.fn(async () => ({
        defaults: { frequency: "daily", serpDepth: 100 },
        owner: { deactivatedAt: null },
        writeMode: "active",
        providerConnections: [
          { id: "connection_1", provider: "dataforseo", credentialSource: "own" },
        ],
      })),
    },
    keyword: {
      findMany: vi.fn(async () => [
        {
          id: "keyword_1",
          text: "history fixture",
          locationId: "location_active",
          archivedAt: null,
          schedule: null,
          checkSchedule: null,
        },
      ]),
    },
    projectMarket: { findMany: vi.fn(async () => [{ locationId: "location_active" }]) },
    queuedRankCheckBatch: { findUnique: vi.fn(async () => null), create: vi.fn() },
    queuedRankCheckTask: { create: vi.fn() },
    rankCheck: { create: vi.fn() },
    rankCheckRun: { create: vi.fn() },
    rankCheckRunItem: { findMany: vi.fn(async () => [item]), updateMany: vi.fn() },
  };
  return { db, http: vi.fn(), quote: vi.fn(async () => [0.725]) };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: fixture.db }));
vi.mock("@temporalio/activity", () => ({
  Context: {
    current: () => ({
      info: { workflowExecution: { workflowId: "owned-queued-worker", runId: "workflow_1" } },
    }),
  },
}));
vi.mock("@/lib/providers/credentials", () => ({
  resolveProviderCredentials: () => ({ login: "fixture", password: "fixture" }),
}));
vi.mock("@/lib/provider-rates/native-rank-request", () => ({
  loadNativeRankRequestCosts: fixture.quote,
}));

const historyInput = {
  batchId: "batch_1",
  claimedAt: "2026-10-11T12:00:00.000Z",
  chunkIndex: 0,
  device: "desktop" as const,
  keywordIds: ["keyword_1"],
  locationId: "location_active",
  projectId: "project_1",
  workflowRunId: "workflow_1",
};
const dispatchClaims = [
  {
    keywordId: "keyword_1",
    stateVersion: "123",
    dueCheckAt: "2026-10-11T12:00:00.000Z",
    advancedCheckAt: "2026-10-12T12:00:00.000Z",
  },
];

function expectNoPreparedWork() {
  expect(fixture.http).not.toHaveBeenCalled();
  expect(fixture.db.queuedRankCheckBatch.create).not.toHaveBeenCalled();
  expect(fixture.db.queuedRankCheckTask.create).not.toHaveBeenCalled();
  expect(fixture.db.rankCheck.create).not.toHaveBeenCalled();
  expect(fixture.db.rankCheckRun.create).not.toHaveBeenCalled();
  expect(fixture.db.rankCheckRunItem.updateMany).not.toHaveBeenCalled();
  expect(
    fixture.db.$executeRaw.mock.calls.every(([query]) =>
      (query as readonly string[]).join("").includes("pg_advisory_xact_lock"),
    ),
  ).toBe(true);
}

describe("queued preparation of historical workflow inputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "1");
    vi.stubGlobal("fetch", fixture.http);
    fixture.db.$transaction.mockImplementation((callback) => callback(fixture.db));
    fixture.db.$queryRaw.mockImplementation(
      async (query, ...values) =>
        workerDefinitionQueryFixture(query, values, (projectId, keywordId) =>
          workerSourceFixture(projectId, keywordId, "history fixture"),
        ) ?? [],
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses history without either claim envelope before any prepared row or provider I/O", async () => {
    await expect(prepareQueuedRankCheckBatch(historyInput)).rejects.toThrow(
      "Legacy queue requires its actual dispatcher advancement claims.",
    );
    expect(fixture.quote).toHaveBeenCalledOnce();
    expectNoPreparedWork();
  });

  it("refuses a missing run-item claim even with a valid dispatcher envelope before paid preparation", async () => {
    await expect(
      prepareQueuedRankCheckBatch({
        ...historyInput,
        runId: "run_1",
        runItemIds: ["item_1"],
        dispatchClaims,
      }),
    ).rejects.toThrow("Original run-item claim changed before preparation.");
    expect(fixture.quote).not.toHaveBeenCalled();
    expectNoPreparedWork();
  });
});
