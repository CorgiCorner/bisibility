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
vi.mock("./deliver", () => ({ recomputeCheckSummary: mocks.recompute }));
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
