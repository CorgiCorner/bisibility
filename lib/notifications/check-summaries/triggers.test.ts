import type { Prisma } from "@/lib/generated/prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { date } from "./fixtures.test-support";
import {
  queueCheckSummary,
  queueRunSummary,
  recomputeSummaryForCheck,
  recomputeSummaryForRun,
} from "./triggers";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  run: vi.fn(),
  recompute: vi.fn(),
  queue: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    rankCheck: { findUnique: mocks.find },
    rankCheckRun: { findUnique: mocks.run, findMany: vi.fn() },
  },
}));
vi.mock("@/lib/notifications/transaction", () => ({ queueNotificationAfterCommit: mocks.queue }));
vi.mock("./deliver", () => ({
  recomputeCheckSummary: mocks.recompute,
  summaryKey: (target: { kind: string; runId?: string; projectId: string }) =>
    target.kind === "manual" ? `run:${target.runId}` : `window:${target.projectId}`,
}));
const tx = {} as Prisma.TransactionClient;
beforeEach(() => {
  vi.setSystemTime(date("07:05:00"));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("post-commit summary triggers", () => {
  it("registers callbacks without configuration or database work in the original transaction", async () => {
    queueCheckSummary(tx, "check");
    queueRunSummary(tx, "run");
    expect(mocks.queue).toHaveBeenCalledTimes(2);
    expect(mocks.find).not.toHaveBeenCalled();
    mocks.find.mockResolvedValue(null);
    await mocks.queue.mock.calls[0][1]();
    expect(mocks.find).toHaveBeenCalledOnce();
  });
  it("recomputes only a still-open scheduled window and skips restored checks", async () => {
    const row = {
      checkedAt: date("06:30:00"),
      finishedAt: date("06:31:00"),
      recoveryRestoredAt: null,
      trigger: "scheduled",
      run: null,
      keyword: { projectId: "project" },
    };
    mocks.find.mockResolvedValue(row);
    await recomputeSummaryForCheck("check");
    expect(mocks.recompute).toHaveBeenCalledOnce();
    mocks.recompute.mockClear();
    vi.setSystemTime(date("07:15:00"));
    await recomputeSummaryForCheck("check");
    expect(mocks.recompute).not.toHaveBeenCalled();
    vi.setSystemTime(date("07:05:00"));
    mocks.find.mockResolvedValue({ ...row, recoveryRestoredAt: date("07:01:00") });
    await recomputeSummaryForCheck("check");
    expect(mocks.recompute).not.toHaveBeenCalled();
  });
});

describe("recomputations of one summary in one process", () => {
  function deferred() {
    const settle: { resolve: (writes: number) => void; reject: (error: Error) => void }[] = [];
    mocks.recompute.mockImplementation(
      () => new Promise<number>((resolve, reject) => settle.push({ resolve, reject })),
    );
    return settle;
  }
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  beforeEach(() => {
    vi.useRealTimers();
    mocks.run.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      projectId: "project",
    }));
  });

  it("holds one connection per summary: later requests share a single follow-up", async () => {
    const settle = deferred();
    const requests = Array.from({ length: 8 }, () => recomputeSummaryForRun("run"));
    await tick();
    // Each recomputation occupies a pool connection while it waits for the per-key lock.
    expect(mocks.recompute).toHaveBeenCalledTimes(1);
    settle[0].resolve(2);
    await tick();
    // The follow-up starts only now, so it reads what every waiting request committed.
    expect(mocks.recompute).toHaveBeenCalledTimes(2);
    settle[1].resolve(0);
    await Promise.all(requests);
    expect(mocks.recompute).toHaveBeenCalledTimes(2);
  });

  it("starts another follow-up for a request that arrives after the first one began", async () => {
    const settle = deferred();
    const first = recomputeSummaryForRun("run");
    await tick();
    const second = recomputeSummaryForRun("run");
    settle[0].resolve(1);
    await tick();
    const third = recomputeSummaryForRun("run");
    await tick();
    expect(mocks.recompute).toHaveBeenCalledTimes(2);
    settle[1].resolve(1);
    await tick();
    expect(mocks.recompute).toHaveBeenCalledTimes(3);
    settle[2].resolve(1);
    await Promise.all([first, second, third]);
  });

  it("keeps different summaries independent and survives a failed recomputation", async () => {
    const settle = deferred();
    const failed = recomputeSummaryForRun("run-a");
    const other = recomputeSummaryForRun("run-b");
    await tick();
    expect(mocks.recompute).toHaveBeenCalledTimes(2);
    const waiting = recomputeSummaryForRun("run-a");
    settle[0].reject(new Error("transaction wait limit"));
    await expect(failed).rejects.toThrow("transaction wait limit");
    await tick();
    expect(mocks.recompute).toHaveBeenCalledTimes(3);
    settle[1].resolve(1);
    settle[2].resolve(1);
    await Promise.all([other, waiting]);
    // Nothing is left behind: the next request starts at once.
    const next = recomputeSummaryForRun("run-a");
    await tick();
    expect(mocks.recompute).toHaveBeenCalledTimes(4);
    settle[3].resolve(0);
    await next;
  });
});
