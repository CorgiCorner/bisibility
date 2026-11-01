import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferQueuedRankCheckBatch } from "./queued-lifecycle";
import { withKeptReason } from "./queued-reason";

const REJECTION =
  "DataForSEO submission rejection is not proof of zero charge: DataForSEO task submission failed with HTTP 402, status 40200: Payment Required.";
const EXPIRY =
  "DataForSEO submission remained ambiguous until the queue-age limit; no task was resubmitted.";

const mocks = vi.hoisted(() => {
  const state = {
    batch: { error: null as string | null, state: "ambiguous" },
    rankCheck: {
      deferredReason: null as string | null,
      error: null as string | null,
      status: "running",
    },
    task: { error: null as string | null, state: "ambiguous" },
  };
  const matches = (value: string, where: { in?: string[] } | string) =>
    typeof where === "string" ? value === where : !where.in || where.in.includes(value);
  const prisma = {
    $queryRaw: vi.fn(async () => [{ state: state.task.state, persistenceLeaseOwner: null }]),
    queuedRankCheckBatch: {
      findUniqueOrThrow: vi.fn(async () => ({ ...state.batch })),
      updateMany: vi.fn(
        async ({ data, where }: { data: Record<string, unknown>; where: { state: never } }) => {
          if (!matches(state.batch.state, where.state)) return { count: 0 };
          Object.assign(state.batch, data);
          return { count: 1 };
        },
      ),
    },
    queuedRankCheckTask: {
      findMany: vi.fn(async () =>
        matches(state.task.state, { in: ["ambiguous", "submitted"] })
          ? [
              {
                batch: { connectionId: "connection_1" },
                costCents: null,
                error: state.task.error,
                id: "qtask_1",
                keyword: {
                  id: "keyword_1",
                  projectId: "project_1",
                  publicId: "kw_abcdefghijklmnopqrstuvwx",
                },
                rankCheck: {
                  previousPosition: null,
                  publicId: "check_abcdefghijklmnopqrstuvwx",
                  requestedDepth: 100,
                  status: state.rankCheck.status,
                },
                rankCheckId: "rank_1",
                state: state.task.state,
              },
            ]
          : [],
      ),
      groupBy: vi.fn(async () => [{ _count: { _all: 1 }, state: state.task.state }]),
      updateMany: vi.fn(
        async ({ data, where }: { data: Record<string, unknown>; where: { state: never } }) => {
          if (!matches(state.task.state, where.state)) return { count: 0 };
          Object.assign(state.task, data);
          return { count: 1 };
        },
      ),
    },
    rankCheck: {
      updateMany: vi.fn(
        async ({ data, where }: { data: Record<string, unknown>; where: { status: string } }) => {
          if (state.rankCheck.status !== where.status) return { count: 0 };
          Object.assign(state.rankCheck, data);
          return { count: 1 };
        },
      ),
    },
  };
  return { prisma, state };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/notifications/transaction", () => ({
  notificationTransaction: (callback: (tx: unknown) => unknown) => callback(mocks.prisma),
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishOperationChanged: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/check-summaries/triggers", () => ({ queueCheckSummary: vi.fn() }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: vi.fn(),
}));
vi.mock("@/lib/provider-evidence/recovery/capture", () => ({
  acknowledgeQueuedRankAttempt: vi.fn(),
  captureRecoveryCandidate: vi.fn(),
}));
vi.mock("@/lib/provider-evidence/recovery/lease", () => ({ lockRecoveryTask: vi.fn() }));
vi.mock("./runs/items", () => ({ applyRunItemTransition: vi.fn() }));

describe("queue-age expiry of an ambiguous submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.batch = { error: REJECTION, state: "ambiguous" };
    mocks.state.rankCheck = { deferredReason: null, error: null, status: "running" };
    mocks.state.task = { error: REJECTION, state: "ambiguous" };
  });

  it("keeps the 4xx rejection reason on the batch, task and check and appends the expiry", async () => {
    await expect(deferQueuedRankCheckBatch("batch_1", EXPIRY)).resolves.toMatchObject({
      state: "deferred",
    });

    const kept = `${REJECTION} ${EXPIRY}`;
    expect(mocks.state.batch).toMatchObject({ error: kept, state: "deferred" });
    expect(mocks.state.task).toMatchObject({ error: kept, state: "deferred" });
    expect(mocks.state.rankCheck.error).toBe(kept);
    // The stable deferral code still names the expiry, not the free-form provider text.
    expect(mocks.state.rankCheck.deferredReason).toBe(EXPIRY);
    expect(mocks.prisma.rankCheck.updateMany.mock.calls[0]?.[0].data).not.toHaveProperty(
      "attemptCount",
    );
  });

  it("does not grow the stored reason when the expiry cleanup retries", async () => {
    await deferQueuedRankCheckBatch("batch_1", EXPIRY);
    mocks.state.batch.state = "ambiguous";

    await deferQueuedRankCheckBatch("batch_1", EXPIRY);

    expect(mocks.state.batch.error).toBe(`${REJECTION} ${EXPIRY}`);
  });

  it("stores the expiry alone when nothing failed before it", async () => {
    mocks.state.batch = { error: null, state: "submitted" };
    mocks.state.task = { error: null, state: "submitted" };

    await deferQueuedRankCheckBatch("batch_1", EXPIRY);

    expect(mocks.state.batch.error).toBe(EXPIRY);
    expect(mocks.state.task.error).toBe(EXPIRY);
  });
});

describe("withKeptReason", () => {
  it.each([
    [null, "note", "note"],
    ["  ", "note", "note"],
    ["first.", "note", "first. note"],
    ["first", "note", "first. note"],
    ["first. note", "note", "first. note"],
  ])("combines %j with %j", (original, note, expected) => {
    expect(withKeptReason(original, note)).toBe(expected);
  });
});
