import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFenced: vi.fn(),
  batch: vi.fn(),
  record: vi.fn(),
  defer: vi.fn(),
  progress: vi.fn(),
  ambiguous: vi.fn(),
  resume: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerBlockedAttempt: { findMany: mocks.findMany },
    meteringPaidAttemptContext: { findFirst: mocks.findFenced },
    queuedRankCheckBatch: { findUniqueOrThrow: mocks.batch },
  },
}));
vi.mock("./queued-submit-transitions", () => ({ markAmbiguous: mocks.ambiguous }));
vi.mock("./queued-lifecycle", () => ({
  deferQueuedRankCheckBatch: mocks.defer,
  queuedBatchProgress: mocks.progress,
}));
vi.mock("@/lib/integrations/provider-recovery/refusal-journal", () => ({
  recordRankRefusals: mocks.record,
}));
vi.mock("./queued-usage-journal", async () => {
  const actual =
    await vi.importActual<typeof import("./queued-usage-journal")>("./queued-usage-journal");
  return { ...actual, resumeSubmittedQueuedUsage: mocks.resume };
});

import {
  persistQueuedRefusal,
  resumeQueuedRefusal,
  resumeUnclaimedBatch,
} from "./queued-account-observation";
import { QueuedUsageSettlementError } from "./queued-usage-journal";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.defer.mockResolvedValue({ state: "deferred" });
  mocks.findFenced.mockResolvedValue(null);
});

it("uses only one complete pre-send refusal identity for the full batch", async () => {
  mocks.findMany.mockResolvedValue([
    { rankCheckId: "a", refusalKey: "incident", reason: "account_blocked" },
    { rankCheckId: "b", refusalKey: "incident", reason: "account_blocked" },
  ]);
  await expect(resumeQueuedRefusal("batch", "connection", ["a", "b"])).resolves.toEqual({
    state: "deferred",
  });
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        connectionId: "connection",
        rankCheckId: { in: ["a", "b"] },
        transportPhase: "not_sent",
      },
    }),
  );
  expect(mocks.defer).toHaveBeenCalledWith("batch", "provider_account_blocked", { preSend: true });
});

it.each([
  [[{ rankCheckId: "a", refusalKey: "one", reason: "account_blocked" }]],
  [
    [
      { rankCheckId: "a", refusalKey: "one", reason: "account_blocked" },
      { rankCheckId: "b", refusalKey: "two", reason: "account_blocked" },
    ],
  ],
])("does not infer a full refusal from incomplete or mixed proof", async (rows) => {
  mocks.findMany.mockResolvedValue(rows);
  await expect(resumeQueuedRefusal("batch", "connection", ["a", "b"])).resolves.toBeNull();
  expect(mocks.defer).not.toHaveBeenCalled();
});

it("propagates database failure without treating it as permission to send", async () => {
  mocks.findMany.mockRejectedValue(new Error("database unavailable"));
  await expect(resumeQueuedRefusal("batch", "connection", ["a"])).rejects.toThrow(
    "database unavailable",
  );
  expect(mocks.defer).not.toHaveBeenCalled();
});

it("keeps a fenced original request ambiguous even if a refusal row exists", async () => {
  mocks.findMany.mockResolvedValue([
    { rankCheckId: "a", refusalKey: "incident", reason: "account_blocked" },
  ]);
  mocks.findFenced.mockResolvedValue({ operation_id: "sent" });
  await expect(resumeQueuedRefusal("batch", "connection", ["a"])).resolves.toBeNull();
  expect(mocks.defer).not.toHaveBeenCalled();
});

it("keeps fenced work ambiguous and refuses stale persistence proof", async () => {
  const proof = {
    batchId: "batch",
    connectionId: "connection",
    credentialVersion: "hash",
    incidentId: "incident",
    legacyVersion: null,
    rankCheckIds: ["a"],
    reason: "account_blocked" as const,
    scope: { kind: "account" as const },
  };
  mocks.batch.mockResolvedValue({
    state: "submitting",
    connectionId: "connection",
    tasks: [{ rankCheckId: "a" }],
  });
  mocks.findFenced.mockResolvedValue({ operation_id: "sent" });
  mocks.progress.mockResolvedValue({ state: "ambiguous", pending: 1 });
  await expect(persistQueuedRefusal(proof)).resolves.toMatchObject({ state: "ambiguous" });
  expect(mocks.ambiguous).toHaveBeenCalledOnce();
  mocks.findFenced.mockResolvedValue(null);
  await expect(persistQueuedRefusal({ ...proof, rankCheckIds: ["other"] })).rejects.toThrow(
    "no longer proves an unsent batch",
  );
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.defer).not.toHaveBeenCalled();
});

it.each(["ambiguous", "completed", "deferred", "failed", "ready", "submitted"])(
  "retains an already %s batch on persistence replay",
  async (state) => {
    mocks.batch.mockResolvedValue({
      state,
      connectionId: "connection",
      tasks: [{ rankCheckId: "a" }],
    });
    mocks.progress.mockResolvedValue({ state, pending: state === "ambiguous" ? 1 : 0 });
    await expect(
      persistQueuedRefusal({
        batchId: "batch",
        connectionId: "connection",
        credentialVersion: "hash",
        incidentId: "incident",
        legacyVersion: null,
        rankCheckIds: ["a"],
        reason: "account_blocked",
        scope: { kind: "account" },
      }),
    ).resolves.toMatchObject({ state });
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.defer).not.toHaveBeenCalled();
  },
);

it("keeps deferred usage when a resumed settlement throws", async () => {
  mocks.resume.mockRejectedValue(
    new QueuedUsageSettlementError(new Error("settle failed"), ["qtask_2"]),
  );
  await expect(
    resumeUnclaimedBatch("batch_1", {
      connection: { credentialSource: "own", id: "connection_1" },
      projectId: "project_1",
      state: "submitted",
      tasks: [],
    } as never),
  ).resolves.toEqual({ deferredUsage: ["qtask_2"], state: "submitted" });
});
