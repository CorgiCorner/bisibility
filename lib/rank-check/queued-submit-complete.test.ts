import { beforeEach, expect, it, vi } from "vitest";
import { completeQueuedResponse } from "./queued-submit-complete";

const mocks = vi.hoisted(() => ({
  persist: vi.fn(),
  recordCodes: vi.fn(),
  settle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./queued-submit-persist", () => ({
  persistQueuedSubmissionResult: mocks.persist,
}));
vi.mock("./queued-account-observation", () => ({
  recordAcceptedQueuedCodes: mocks.recordCodes,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    queuedRankCheckBatch: {
      findUniqueOrThrow: vi.fn(async () => ({ state: "submitted" })),
    },
  },
}));

const connection = {
  credentialsEncrypted: "encrypted",
  credentialSource: "own" as const,
  id: "connection_1",
};
const result = {
  accepted: [
    {
      correlationId: "qtask_1",
      costCents: 1.2,
      providerTaskId: "provider_1",
      tag: "tag",
    },
  ],
  failed: [],
  unknown: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settle.mockResolvedValue({ deferred: [] });
  mocks.recordCodes.mockResolvedValue(undefined);
});

it("settles known receipts when persistence fails and rethrows that error", async () => {
  const error = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  mocks.persist.mockRejectedValueOnce(error);

  await expect(
    completeQueuedResponse("batch_1", connection, "project_1", result, null, {
      discard: vi.fn(),
      settle: mocks.settle,
      transportStarted: vi.fn(),
    }),
  ).rejects.toMatchObject({ code: "ECONNRESET" });

  expect(mocks.settle).toHaveBeenCalledOnce();
  expect(mocks.recordCodes).not.toHaveBeenCalled();
});

it("returns deferred usage when settlement throws after collecting it", async () => {
  const { QueuedUsageSettlementError } = await import("./queued-usage-journal");
  mocks.persist.mockResolvedValue(undefined);
  mocks.settle.mockRejectedValue(
    new QueuedUsageSettlementError(new Error("settle failed"), ["qtask_2"]),
  );

  await expect(
    completeQueuedResponse("batch_1", connection, "project_1", result, null, {
      discard: vi.fn(),
      settle: mocks.settle,
      transportStarted: vi.fn(),
    }),
  ).resolves.toEqual({ deferredUsage: ["qtask_2"], state: "submitted" });
});
